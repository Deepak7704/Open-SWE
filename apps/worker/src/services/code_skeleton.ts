import type{ 
  EnhancedCodeGraph, 
  EnhancedCodeNode, 
  FunctionSignature,
  MethodInfo,
  PropertyInfo 
} from './code_graph.service';

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON DATA STRUCTURES (Simplified versions for output)
// ═══════════════════════════════════════════════════════════════════════════════

export interface CodeSkeleton {
  filePath: string;
  fileName: string;
  
  imports: ImportSkeleton[];
  exports: ExportSkeleton[];
  functions: FunctionSkeleton[];
  classes: ClassSkeleton[];
  
  stats: {
    totalFunctions: number;
    totalClasses: number;
    totalImports: number;
    totalExports: number;
    linesOfCode: number;
  };
}

export interface ImportSkeleton {
  name: string;
  source: string;
}

export interface ExportSkeleton {
  name: string;
  type: string;
}

export interface FunctionSkeleton {
  name: string;
  signature: string;
  lineRange: string;
  linesOfCode: number;
  isAsync: boolean;
  isExported: boolean;
  calls: string[];
  calledBy: string[];
  dependencies: string[];
  errors: string[];
}

export interface ClassSkeleton {
  name: string;
  lineRange: string;
  linesOfCode: number;
  extendsFrom?: string;
  isExported: boolean;
  properties: PropertyInfo[];      // ← REUSE from code_graph.service
  methods: MethodInfo[];            // ← REUSE from code_graph.service
}

// ═══════════════════════════════════════════════════════════════════════════════
// CODE SKELETON SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class CodeSkeletonService {
  
  /**
   * Generate skeleton from code graph
   */
  generateSkeleton(graph: EnhancedCodeGraph, filePath: string): CodeSkeleton {
    const fileName = filePath.split('/').pop() || 'unknown';
    const fileNodes = this.getFileNodes(graph, filePath);
    
    console.log(`  Generating skeleton for ${fileName}...`);

    const reverseCallGraph = this.buildReverseCallGraph(fileNodes);

    const imports = this.extractImportSkeletons(fileNodes, graph);
    const exports = this.extractExportSkeletons(fileNodes);
    const functions = this.extractFunctionSkeletons(fileNodes, reverseCallGraph);
    const classes = this.extractClassSkeletons(fileNodes);

    const totalLoc = fileNodes.reduce((sum, n) => sum + (n.location?.lineCount || 0), 0);

    return {
      filePath,
      fileName,
      imports,
      exports,
      functions,
      classes,
      stats: {
        totalFunctions: functions.length,
        totalClasses: classes.length,
        totalImports: imports.length,
        totalExports: exports.length,
        linesOfCode: totalLoc
      }
    };
  }

  /**
   * Format skeleton as LLM-friendly text
   */
  formatSkeletonForLLM(skeleton: CodeSkeleton): string {
    let output = '';

    // Header
    output += `${'═'.repeat(80)}\n`;
    output += `FILE: ${skeleton.fileName}\n`;
    output += `Path: ${skeleton.filePath}\n`;
    output += `Stats: ${skeleton.stats.totalFunctions} functions, ${skeleton.stats.totalClasses} classes, ${skeleton.stats.totalImports} imports, ~${skeleton.stats.linesOfCode} lines\n`;
    output += `${'═'.repeat(80)}\n\n`;

    // Imports
    if (skeleton.imports.length > 0) {
      output += `IMPORTS (${skeleton.imports.length})\n`;
      skeleton.imports.forEach(imp => {
        output += `  import ${imp.name} from "${imp.source}"\n`;
      });
      output += `\n`;
    }

    // Exports
    if (skeleton.exports.length > 0) {
      output += `EXPORTS (${skeleton.exports.length})\n`;
      skeleton.exports.forEach(exp => {
        output += `  export ${exp.type} ${exp.name}\n`;
      });
      output += `\n`;
    }

    // Functions
    if (skeleton.functions.length > 0) {
      output += `FUNCTIONS (${skeleton.functions.length})\n\n`;
      skeleton.functions.forEach(func => {
        output += `  ${func.isExported ? '[EXPORTED]' : '[PRIVATE]'} ${func.name}\n`;
        output += `    ${func.signature}\n`;
        output += `    Lines: ${func.lineRange} (${func.linesOfCode} lines)\n`;
        
        if (func.calls.length > 0) {
          output += `    Calls: ${func.calls.join(', ')}\n`;
        }
        if (func.calledBy.length > 0) {
          output += `    Called by: ${func.calledBy.join(', ')}\n`;
        }
        if (func.dependencies.length > 0) {
          output += `    Uses: ${func.dependencies.join(', ')}\n`;
        }
        if (func.errors.length > 0) {
          output += `    Throws: ${func.errors.join(', ')}\n`;
        }
        output += `\n`;
      });
    }

    // Classes
    if (skeleton.classes.length > 0) {
      output += `CLASSES (${skeleton.classes.length})\n\n`;
      skeleton.classes.forEach(cls => {
        output += `  ${cls.isExported ? '[EXPORTED]' : '[PRIVATE]'} class ${cls.name}\n`;
        output += `    Lines: ${cls.lineRange} (${cls.linesOfCode} lines)\n`;
        
        if (cls.extendsFrom) {
          output += `    Extends: ${cls.extendsFrom}\n`;
        }
        
        if (cls.properties.length > 0) {
          output += `    Properties (${cls.properties.length}):\n`;
          cls.properties.forEach(prop => {
            output += `      ${prop.accessLevel || 'public'} ${prop.name}: ${prop.type || 'any'}${prop.isOptional ? '?' : ''}\n`;
          });
        }
        
        if (cls.methods.length > 0) {
          output += `    Methods (${cls.methods.length}):\n`;
          cls.methods.forEach(method => {
            const sig = this.buildSignatureString(method.signature);
            output += `      ${method.accessLevel || 'public'} ${sig}\n`;
            if (method.signature.calledFunctions && method.signature.calledFunctions.length > 0) {
              output += `        Calls: ${method.signature.calledFunctions.join(', ')}\n`;
            }
          });
        }
        output += `\n`;
      });
    }

    output += `${'═'.repeat(80)}\n`;

    return output;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═════════════════════════════════════════════════════════════════════════════

  private getFileNodes(graph: EnhancedCodeGraph, filePath: string): EnhancedCodeNode[] {
    const nodeIds = graph.fileToNodes.get(filePath) || [];
    return nodeIds.map(id => graph.nodes.get(id)).filter(Boolean) as EnhancedCodeNode[];
  }

  private buildReverseCallGraph(fileNodes: EnhancedCodeNode[]): Map<string, string[]> {
    const reverseGraph = new Map<string, string[]>();

    fileNodes.forEach(node => {
      if (node.type === 'function' && node.signature?.calledFunctions) {
        node.signature.calledFunctions.forEach(calledFunc => {
          const callers = reverseGraph.get(calledFunc) || [];
          callers.push(node.name);
          reverseGraph.set(calledFunc, callers);
        });
      }
    });

    return reverseGraph;
  }

  private extractImportSkeletons(
    fileNodes: EnhancedCodeNode[],
    graph: EnhancedCodeGraph
  ): ImportSkeleton[] {
    const imports: ImportSkeleton[] = [];
    
    fileNodes
      .filter(n => n.type === 'import')
      .forEach(node => {
        const edges = graph.edges.get(node.filePath) || [];
        const importEdge = edges.find(e => e.type === 'imports');
        const source = importEdge?.target || 'unknown';
        
        imports.push({
          name: node.name,
          source
        });
      });
    
    return imports;
  }

  private extractExportSkeletons(fileNodes: EnhancedCodeNode[]): ExportSkeleton[] {
    return fileNodes
      .filter(n => n.isExported)
      .map(node => ({
        name: node.name,
        type: node.type
      }));
  }

  private extractFunctionSkeletons(
    fileNodes: EnhancedCodeNode[],
    reverseCallGraph: Map<string, string[]>
  ): FunctionSkeleton[] {
    return fileNodes
      .filter(n => n.type === 'function')
      .map(node => {
        const sig = node.signature!;
        const signatureStr = this.buildSignatureString(sig);
        const lineRange = `${node.location.start.line}-${node.location.end.line}`;

        return {
          name: node.name,
          signature: signatureStr,
          lineRange,
          linesOfCode: node.location.lineCount,
          isAsync: sig.isAsync || false,
          isExported: node.isExported || false,
          calls: sig.calledFunctions || [],
          calledBy: reverseCallGraph.get(node.name) || [],
          dependencies: node.context?.externalDependencies || [],
          errors: node.context?.thrownErrors || []
        };
      });
  }

  private extractClassSkeletons(fileNodes: EnhancedCodeNode[]): ClassSkeleton[] {
    return fileNodes
      .filter(n => n.type === 'class')
      .map(node => {
        const lineRange = `${node.location.start.line}-${node.location.end.line}`;

        return {
          name: node.name,
          lineRange,
          linesOfCode: node.location.lineCount,
          extendsFrom: node.extendsFrom,
          isExported: node.isExported || false,
          properties: node.properties || [],     // ← Direct reuse, no mapping
          methods: node.methods || []            // ← Direct reuse, no mapping
        };
      });
  }

  private buildSignatureString(sig: FunctionSignature): string {
    const params = sig.parameters.map(p => 
      `${p.name}${p.optional ? '?' : ''}: ${p.type || 'any'}`
    ).join(', ');
    
    const returnType = sig.returnType || 'void';
    const prefix = sig.isAsync ? 'async ' : '';
    
    return `${prefix}${sig.name}(${params}): ${returnType}`;
  }
}
