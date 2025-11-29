/**
 * Code Generation + Validation LangGraph Workflow
 * Generates code, validates it, and retries on errors (max 3 iterations)
 */

import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { Sandbox } from '@e2b/code-interpreter';
import { AIService } from '../services/ai.service';
import { SandboxService } from '../services/sandbox.service';
import { ValidationService } from '../services/validation.service';
import { GitService } from '../services/git.service';
import { GitHubService } from '../services/github.service';
import type { GenerateOutput } from '@openswe/shared';
import { extractKeywords } from '../utils/helpers';

export const CodeValidationState = Annotation.Root({
  repoUrl: Annotation<string>(),
  repoId: Annotation<string>(),
  task: Annotation<string>(),
  forkUrl: Annotation<string>(),
  forkOwner: Annotation<string>(),
  branchName: Annotation<string>(),
  packageManager: Annotation<string>(),

  relevantFiles: Annotation<string[]>(),
  filesToModify: Annotation<string[]>(),
  fileContents: Annotation<Map<string, string>>(),
  allFiles: Annotation<string[]>(),
  keywords: Annotation<string[]>(),
  codeSkeletons: Annotation<Map<string, string>>(),

  sandbox: Annotation<Sandbox>(),
  repoPath: Annotation<string>(),
  projectId: Annotation<string>(),
  githubToken: Annotation<string>(),

  generatedCode: Annotation<GenerateOutput | null>({
    reducer: (_, update) => update,
    default: () => null
  }),

  validationErrors: Annotation<string[]>({
    reducer: (_, update) => update,
    default: () => []
  }),
  typeErrors: Annotation<string[]>({
    reducer: (_, update) => update,
    default: () => []
  }),
  syntaxErrors: Annotation<string[]>({
    reducer: (_, update) => update,
    default: () => []
  }),
  allValidationsPassed: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false
  }),

  currentIteration: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0
  }),
  maxIterations: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 3
  }),

  status: Annotation<"generating" | "validating" | "success" | "failed">({
    reducer: (_, update) => update,
    default: () => "generating"
  }),

  prUrl: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null
  }),
  prNumber: Annotation<number | null>({
    reducer: (_, update) => update,
    default: () => null
  }),

  errorMessage: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null
  })
});

type CodeValidationStateType = typeof CodeValidationState.State;

async function generateCodeNode(
  state: CodeValidationStateType
): Promise<Partial<CodeValidationStateType>> {
  console.log(`\nCode Generation Node (Iteration ${state.currentIteration + 1}/${state.maxIterations})`);

  const aiService = new AIService();
  const sandboxService = new SandboxService();

  try {
    const previousErrors = state.validationErrors.length > 0
      ? state.validationErrors
      : undefined;

    if (previousErrors && previousErrors.length > 0) {
      console.log('Previous validation errors detected:');
      previousErrors.forEach((error, idx) => {
        console.log(`  ${idx + 1}. ${error}`);
      });
      console.log('Regenerating code to fix errors...\n');
    }

    const generation = await aiService.generateCodeChanges(
      state.repoUrl,
      state.task,
      state.fileContents,
      state.relevantFiles,
      state.allFiles,
      state.keywords,
      state.packageManager,
      state.codeSkeletons,
      previousErrors
    );

    console.log('Code generation complete');
    console.log(`  File operations: ${generation.fileOperations.length}`);
    console.log(`  Shell commands: ${generation.shellCommands?.length || 0}`);

    console.log('\nExecuting file operations...');
    await sandboxService.executeFileOperations(
      state.sandbox,
      generation.fileOperations,
      state.repoPath
    );

    if (generation.shellCommands && generation.shellCommands.length > 0) {
      console.log('Running shell commands...');
      await sandboxService.runShellCommands(
        state.sandbox,
        generation.shellCommands,
        state.repoPath,
        state.packageManager
      );
    }

    return {
      generatedCode: generation,
      currentIteration: state.currentIteration + 1,
      status: "validating" as const,
      validationErrors: [],
      typeErrors: [],
      syntaxErrors: []
    };

  } catch (error) {
    console.error('Code generation failed:', error);
    return {
      status: "failed" as const,
      errorMessage: `Code generation failed: ${(error as Error).message}`
    };
  }
}

async function validateCodeNode(
  state: CodeValidationStateType
): Promise<Partial<CodeValidationStateType>> {
  console.log('\nValidation Node');

  const validationService = new ValidationService();

  try {
    console.log('Running validation checks...');
    const validationResult = await validationService.validate(
      state.sandbox,
      state.packageManager,
      {
        checkSyntax: true,
        checkTypes: true,
        runTests: false,
        runBuild: false
      }
    );

    console.log('\nValidation Results:');
    console.log(`  Syntax check: ${validationResult.checks.syntax.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  Type check: ${validationResult.checks.types.passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  Overall: ${validationResult.allPassed ? 'ALL PASSED' : 'HAS ERRORS'}`);
    console.log(`  Error count: ${validationResult.errorCount}`);

    const allErrors: string[] = [];
    const typeErrors: string[] = [];
    const syntaxErrors: string[] = [];

    if (!validationResult.checks.syntax.passed) {
      console.log('\nSyntax Errors:');
      validationResult.checks.syntax.errors.forEach((error, idx) => {
        console.log(`  ${idx + 1}. ${error}`);
        syntaxErrors.push(error);
        allErrors.push(`[SYNTAX] ${error}`);
      });
    }

    if (!validationResult.checks.types.passed) {
      console.log('\nType Errors:');
      validationResult.checks.types.errors.forEach((error, idx) => {
        console.log(`  ${idx + 1}. ${error}`);
        typeErrors.push(error);
        allErrors.push(`[TYPE] ${error}`);
      });
    }

    if (validationResult.allPassed) {
      console.log('\nAll validations passed! Ready to create PR.');
      return {
        allValidationsPassed: true,
        validationErrors: [],
        typeErrors: [],
        syntaxErrors: [],
        status: "success" as const
      };
    } else {
      console.log(`\nValidation failed with ${allErrors.length} error(s)`);
      console.log(`  Current iteration: ${state.currentIteration}/${state.maxIterations}`);

      if (state.currentIteration >= state.maxIterations) {
        console.log('  Max iterations reached. Will fail.');
      } else {
        console.log('  Will retry generation with error context.');
      }

      return {
        allValidationsPassed: false,
        validationErrors: allErrors,
        typeErrors,
        syntaxErrors,
        status: "generating" as const
      };
    }

  } catch (error) {
    console.error('Validation failed:', error);
    return {
      status: "failed" as const,
      errorMessage: `Validation failed: ${(error as Error).message}`,
      allValidationsPassed: false
    };
  }
}

async function createPRNode(
  state: CodeValidationStateType
): Promise<Partial<CodeValidationStateType>> {
  console.log('\nCreate Pull Request Node');

  const gitService = new GitService();
  const githubService = new GitHubService(state.githubToken);

  try {
    console.log('Committing and pushing changes...');
    await gitService.commitAndPush(
      state.sandbox,
      state.repoPath,
      state.branchName,
      `feat: ${state.task}\n\nCode validated successfully (${state.currentIteration} iteration${state.currentIteration > 1 ? 's' : ''})`,
      state.forkUrl,
      state.githubToken
    );

    console.log('Creating pull request...');
    const pr = await githubService.createPullRequest(
      state.repoUrl,
      state.forkOwner,
      state.branchName,
      state.task,
      state.generatedCode?.explanation || ''
    );

    console.log(`\nPull Request Created!`);
    console.log(`  URL: ${pr.url}`);
    console.log(`  Number: #${pr.number}`);

    return {
      prUrl: pr.url,
      prNumber: pr.number,
      status: "success" as const
    };

  } catch (error) {
    console.error('PR creation failed:', error);
    return {
      status: "failed" as const,
      errorMessage: `PR creation failed: ${(error as Error).message}`
    };
  }
}

async function handleFailureNode(
  state: CodeValidationStateType
): Promise<Partial<CodeValidationStateType>> {
  console.log('\nFailure Node');

  let failureReason = state.errorMessage;

  if (!failureReason && state.validationErrors.length > 0) {
    failureReason = `Max iterations (${state.maxIterations}) reached. Unable to fix validation errors:\n${state.validationErrors.join('\n')}`;
  }

  console.log('Job failed:');
  console.log(`  Reason: ${failureReason}`);
  console.log(`  Iterations attempted: ${state.currentIteration}`);
  console.log(`  Validation errors: ${state.validationErrors.length}`);

  if (state.validationErrors.length > 0) {
    console.log('\nFinal validation errors:');
    state.validationErrors.forEach((error, idx) => {
      console.log(`  ${idx + 1}. ${error}`);
    });
  }

  return {
    status: "failed" as const,
    errorMessage: failureReason || 'Unknown failure'
  };
}

function shouldContinue(
  state: CodeValidationStateType
): "generate" | "createPR" | "failed" {

  if (state.allValidationsPassed && state.status === "success") {
    console.log('\nRouter decision: CREATE PR (all validations passed)');
    return "createPR";
  }

  if (state.currentIteration >= state.maxIterations) {
    console.log(`\nRouter decision: FAILED (max iterations ${state.maxIterations} reached)`);
    return "failed";
  }

  if (state.validationErrors.length > 0) {
    console.log(`\nRouter decision: REGENERATE (iteration ${state.currentIteration}/${state.maxIterations})`);
    return "generate";
  }

  if (state.status === "failed") {
    console.log('\nRouter decision: FAILED (status is failed)');
    return "failed";
  }

  console.log('\nRouter decision: FAILED (unexpected state)');
  return "failed";
}

export function createCodeValidationGraph() {
  console.log('Building Code Validation LangGraph...');

  const workflow = new StateGraph(CodeValidationState)
    .addNode("generate", generateCodeNode)
    .addNode("validate", validateCodeNode)
    .addNode("createPR", createPRNode)
    .addNode("failed", handleFailureNode)
    .addEdge(START, "generate")
    .addEdge("generate", "validate")
    .addConditionalEdges(
      "validate",
      shouldContinue,
      {
        "generate": "generate",
        "createPR": "createPR",
        "failed": "failed"
      }
    )
    .addEdge("createPR", END)
    .addEdge("failed", END);

  console.log('LangGraph workflow built successfully\n');

  return workflow.compile();
}
