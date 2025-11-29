import type { Sandbox } from '@e2b/code-interpreter';
import type {
  ValidationResult,
  ValidationCheck,
  TestValidationCheck
} from '../types/workflows';

interface ValidationOptions {
  checkSyntax: boolean;
  checkTypes: boolean;
  runTests: boolean;
  runBuild?: boolean;
}

export class ValidationService {

  async validate(
    sandbox: Sandbox,
    packageManager: string,
    options: ValidationOptions
  ): Promise<ValidationResult> {
    const startTime = Date.now();

    const checks: Partial<ValidationResult['checks']> = {
      syntax: { passed: true, errors: [] },
      types: { passed: true, errors: [] },
      tests: { passed: true, errors: [], passCount: 0, failCount: 0 },
    };

    if (options.checkSyntax) {
      checks.syntax = await this.checkSyntax(sandbox);
      if (!checks.syntax.passed) {
        return this.buildResult(checks, startTime);
      }
    }

    if (options.checkTypes) {
      checks.types = await this.checkTypes(sandbox);
    }

    if (options.runTests) {
      checks.tests = await this.runTests(sandbox, packageManager);
    }

    if (options.runBuild) {
      checks.build = await this.runBuild(sandbox, packageManager);
    }

    return this.buildResult(checks, startTime);
  }

  private async checkSyntax(sandbox: Sandbox): Promise<ValidationCheck> {
    const errors: string[] = [];

    const hasTSConfig = await this.fileExists(sandbox, 'tsconfig.json');
    const hasPackageJson = await this.fileExists(sandbox, 'package.json');
    const hasPyRequirements = await this.fileExists(sandbox, 'requirements.txt');

    if (hasTSConfig || hasPackageJson) {
      const result = await sandbox.commands.run('cd /tmp && npx -y -p typescript@latest tsc --noEmit --project /home/user/project/tsconfig.json 2>&1 || true');

      if (result.stdout.includes('Cannot find a tsconfig.json file')) {
        console.log('No root tsconfig.json found (likely a monorepo), skipping type checking');
        return { passed: true, errors: [] };
      }

      if (result.exitCode !== 0 && !result.stdout.includes('Cannot find a tsconfig.json file')) {
        errors.push(...this.parseTSErrors(result.stdout + result.stderr));
      }
    } else if (hasPyRequirements) {
      const result = await sandbox.commands.run('cd /home/user/project && python -m py_compile **/*.py 2>&1');
      if (result.exitCode !== 0) {
        errors.push(result.stderr);
      }
    }

    return { passed: errors.length === 0, errors };
  }

  private async checkTypes(sandbox: Sandbox): Promise<ValidationCheck> {
    const errors: string[] = [];
    const hasTSConfig = await this.fileExists(sandbox, 'tsconfig.json');

    if (hasTSConfig) {
      const result = await sandbox.commands.run('cd /tmp && npx -y -p typescript@latest tsc --strict --noEmit --project /home/user/project/tsconfig.json 2>&1 || true');

      if (result.stdout.includes('Cannot find a tsconfig.json file')) {
        console.log('No root tsconfig.json found (likely a monorepo), skipping type checking');
        return { passed: true, errors: [] };
      }

      if (result.exitCode !== 0 && !result.stdout.includes('Cannot find a tsconfig.json file')) {
        errors.push(...this.parseTSErrors(result.stdout + result.stderr));
      }
    }

    return { passed: errors.length === 0, errors };
  }

  private async runTests(sandbox: Sandbox, packageManager: string): Promise<TestValidationCheck> {
    const packageJson = await this.readJSON(sandbox, 'package.json');
    let testCommand = `${packageManager} test`;

    if (!packageJson?.scripts?.test) {
      const hasPytest = await this.fileExists(sandbox, 'pytest.ini');
      const hasGoMod = await this.fileExists(sandbox, 'go.mod');

      if (hasPytest) {
        testCommand = 'pytest --tb=short';
      } else if (hasGoMod) {
        testCommand = 'go test ./...';
      } else {
        return { passed: true, errors: [], passCount: 0, failCount: 0 };
      }
    }

    const result = await sandbox.commands.run(
      `cd /home/user/project && ${testCommand} 2>&1`,
      { timeoutMs: 300000 }
    );

    const testResults = this.parseTestOutput(result.stdout + result.stderr, testCommand);

    return {
      passed: result.exitCode === 0 && testResults.failCount === 0,
      errors: testResults.failures,
      passCount: testResults.passCount,
      failCount: testResults.failCount,
    };
  }

  private async runBuild(sandbox: Sandbox, packageManager: string): Promise<ValidationCheck> {
    const packageJson = await this.readJSON(sandbox, 'package.json');

    if (!packageJson?.scripts?.build) {
      return { passed: true, errors: [] };
    }

    const result = await sandbox.commands.run(
      `cd /home/user/project && ${packageManager} run build 2>&1`,
      { timeoutMs: 600000 }
    );

    return {
      passed: result.exitCode === 0,
      errors: result.exitCode !== 0 ? [result.stdout + result.stderr] : [],
    };
  }

  private buildResult(
    checks: Partial<ValidationResult['checks']>,
    startTime: number
  ): ValidationResult {
    const allPassed = Object.values(checks).every((check) => check?.passed === true);

    const errorCount =
      (checks.syntax?.errors.length || 0) +
      (checks.types?.errors.length || 0) +
      (checks.tests?.errors.length || 0) +
      (checks.build?.errors.length || 0);

    let score = 0;
    const weights = { syntax: 0.2, types: 0.2, tests: 0.6 };

    if (checks.syntax?.passed) score += weights.syntax;
    if (checks.types?.passed) score += weights.types;
    if (checks.tests) {
      const total = checks.tests.passCount + checks.tests.failCount;
      const testScore = total > 0 ? checks.tests.passCount / total : 1;
      score += weights.tests * testScore;
    }

    return {
      allPassed,
      score,
      errorCount,
      checks: checks as ValidationResult['checks'],
      executionTime: Date.now() - startTime,
    };
  }

  private async fileExists(sandbox: Sandbox, path: string): Promise<boolean> {
    const result = await sandbox.commands.run(
      `test -f /home/user/project/${path} && echo "exists" || echo "missing"`
    );
    return result.stdout.includes('exists');
  }

  private async readJSON(sandbox: Sandbox, path: string): Promise<any> {
    const result = await sandbox.commands.run(`cat /home/user/project/${path} 2>/dev/null`);
    try {
      return JSON.parse(result.stdout);
    } catch {
      return null;
    }
  }

  private parseTSErrors(output: string): string[] {
    return output.split('\n')
      .filter((line) => line.includes('error TS'))
      .map((line) => line.trim());
  }

  private parseTestOutput(
    output: string,
    command: string
  ): { failures: string[]; passCount: number; failCount: number } {

    if (command.includes('jest') || command.includes('vitest') || command.includes('npm test')) {
      const passMatch = output.match(/(\d+)\s+pass/);
      const failMatch = output.match(/(\d+)\s+fail/);
      const passCount = passMatch && passMatch[1] ? parseInt(passMatch[1]) : 0;
      const failCount = failMatch && failMatch[1] ? parseInt(failMatch[1]) : 0;

      const failures: string[] = [];
      const failureRegex = /●\s+(.+?)(?=\n\n|$)/gs;
      let match;
      while ((match = failureRegex.exec(output)) !== null) {
        if (match[1]) {
          failures.push(match[1].replace(/\n/g, ' ').trim());
        }
      }

      return { failures, passCount, failCount };
    }

    if (command.includes('pytest')) {
      const match = output.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?/);
      const passCount = match && match[1] ? parseInt(match[1]) : 0;
      const failCount = match && match[2] ? parseInt(match[2]) : 0;

      const failures = output.split('FAILED').slice(1).map((f) => f.split('\n')[0]?.trim() || '');

      return { failures, passCount, failCount };
    }

    if (command.includes('go test')) {
      const passMatch = output.match(/PASS/g);
      const failMatch = output.match(/FAIL/g);
      const passCount = passMatch ? passMatch.length : 0;
      const failCount = failMatch ? failMatch.length : 0;

      const failures = output.split('\n')
        .filter((line) => line.includes('FAIL:'))
        .map((line) => line.trim());

      return { failures, passCount, failCount };
    }

    return { failures: [], passCount: 0, failCount: 0 };
  }
}
