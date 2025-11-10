import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS (INTERFACES)
// ═══════════════════════════════════════════════════════════════════════════════

export interface Parameter {
  name: string;
  type?: string;
  optional?: boolean;
  defaultValue?: string;
}

export interface FunctionSignature {
  name: string;
  parameters: Parameter[];
  returnType?: string;
  isAsync?: boolean;
  calledFunctions?: string[];
}

export interface LocationInfo {
  start: { line: number; column: number };
  end: { line: number; column: number };
  lineCount: number;
}

export interface FunctionContext {
  usedVariables: string[];
  declaredVariables: string[];
  externalDependencies: string[];
  thrownErrors: string[];
}

export interface PropertyInfo {
  name: string;
  type?: string;
  accessLevel?: string;
  defaultValue?: string;
  isOptional?: boolean;
}

export interface MethodInfo {
  name: string;
  signature: FunctionSignature;
  accessLevel?: string;
  isStatic?: boolean;
  isAsync?: boolean;
}

export interface EnhancedCodeNode {
  id: string;
  type: string;
  name: string;
  filePath: string;
  location: LocationInfo;
  signature?: FunctionSignature;
  context?: FunctionContext;
  docstring?: string;
  properties?: PropertyInfo[];
  methods?: MethodInfo[];
  extendsFrom?: string;
  isExported?: boolean;
  modifiers?: string[];
}

export interface CodeEdge {
  source: string;
  target: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface EnhancedCodeGraph {
  nodes: Map<string, EnhancedCodeNode>;
  edges: Map<string, CodeEdge[]>;
  fileToNodes: Map<string, string[]>;
  nameToNodes: Map<string, string[]>;
  functionCalls: Map<string, Set<string>>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class EnhancedCodeGraphService {
  /**
   * Build enhanced code graph from file contents
   * INPUT: fileContents - Map of filePath -> sourceCode (already read from sandbox)
   * OUTPUT: EnhancedCodeGraph with all nodes, edges, and relationships
   */
  buildGraph(fileContents: Map<string, string>): EnhancedCodeGraph {
    const graph: EnhancedCodeGraph = {
      nodes: new Map(),
      edges: new Map(),
      fileToNodes: new Map(),
      nameToNodes: new Map(),
      functionCalls: new Map()
    };

    fileContents.forEach((content, filePath) => {
      console.log(`Parsing: ${filePath}`);

      try {
        const ast = parse(content, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx', 'decorators-legacy']
        });

        this.extractFromAST(ast, filePath, graph);
      } catch (error) {
        console.error(`Failed to parse ${filePath}:`, (error as Error).message);
      }
    });

    console.log(`Graph built: ${graph.nodes.size} nodes`);
    return graph;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // MAIN AST EXTRACTION METHOD
  // ═════════════════════════════════════════════════════════════════════════════

  private extractFromAST(ast: any, filePath: string, graph: EnhancedCodeGraph): void {
    const scopeCallsMap = new Map<string, Set<string>>();

    traverse(ast, {
      // VISITOR 1: FunctionDeclaration
      FunctionDeclaration: (path: NodePath) => {
        const node = path.node as t.FunctionDeclaration;

        if (!node.loc) return;

        const functionName = node.id?.name || 'anonymous';
        const functionId = `${filePath}:${functionName}`;

        console.log(`  Found function: ${functionName}`);

        const signature = this.buildFunctionSignature(node, path);
        const context = this.extractFunctionContext(path);
        const calledFunctions = this.extractCalledFunctions(path);

        scopeCallsMap.set(functionId, new Set(calledFunctions));

        const codeNode: EnhancedCodeNode = {
          id: functionId,
          type: 'function',
          name: functionName,
          filePath,
          location: {
            start: node.loc.start,
            end: node.loc.end,
            lineCount: node.loc.end.line - node.loc.start.line + 1
          },
          signature,
          context,
          isExported: this.isNodeExported(path),
          modifiers: this.extractModifiers(node)
        };

        this.addNodeToGraph(graph, codeNode);

        calledFunctions.forEach(calledFunc => {
          this.addEdgeToGraph(graph, functionId, calledFunc, 'calls');
        });
      },

      // VISITOR 2: ClassDeclaration
      ClassDeclaration: (path: NodePath) => {
        const node = path.node as t.ClassDeclaration;

        if (!node.loc) return;

        const className = node.id?.name || 'AnonymousClass';
        const classId = `${filePath}:${className}`;

        console.log(`  Found class: ${className}`);

        const properties = this.extractClassProperties(node);
        const methods = this.extractClassMethods(node, path, classId);
        const extendsFrom = node.superClass && t.isIdentifier(node.superClass)
          ? (node.superClass as t.Identifier).name
          : undefined;

        const classNode: EnhancedCodeNode = {
          id: classId,
          type: 'class',
          name: className,
          filePath,
          location: {
            start: node.loc.start,
            end: node.loc.end,
            lineCount: node.loc.end.line - node.loc.start.line + 1
          },
          properties,
          methods,
          extendsFrom,
          isExported: this.isNodeExported(path),
          modifiers: this.extractModifiers(node)
        };

        this.addNodeToGraph(graph, classNode);

        if (extendsFrom) {
          this.addEdgeToGraph(graph, classId, extendsFrom, 'extends');
        }
      },

      // VISITOR 3: ImportDeclaration
      ImportDeclaration: (path: NodePath) => {
        const node = path.node as t.ImportDeclaration;
        const importSource = node.source.value;

        node.specifiers.forEach(spec => {
          let importName = '';

          if (t.isImportDefaultSpecifier(spec)) {
            importName = spec.local.name;
          } else if (t.isImportSpecifier(spec)) {
            const importedNode = (spec as t.ImportSpecifier).imported;
            // FIX: Check if imported is an Identifier before accessing .name
            if (t.isIdentifier(importedNode)) {
              importName = importedNode.name;
            }
          }

          if (importName) {
            console.log(`  Found import: ${importName} from ${importSource}`);

            const importId = `${filePath}:import:${importName}`;

            const importNode: EnhancedCodeNode = {
              id: importId,
              type: 'import',
              name: importName,
              filePath,
              location: {
                start: node.loc?.start || { line: 0, column: 0 },
                end: node.loc?.end || { line: 0, column: 0 },
                lineCount: 1
              }
            };

            this.addNodeToGraph(graph, importNode);
            this.addEdgeToGraph(graph, filePath, importSource, 'imports');
          }
        });
      }
    });

    scopeCallsMap.forEach((calls, functionId) => {
      graph.functionCalls.set(functionId, calls);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS - SIGNATURE BUILDING
  // ═════════════════════════════════════════════════════════════════════════════

  private buildFunctionSignature(
    node: t.FunctionDeclaration,
    path: NodePath
  ): FunctionSignature {
    const params = node.params || [];

    const parameters = params.map((param: any) => {
      const paramName = t.isIdentifier(param) ? param.name : 'unknown';
      const paramType = (param as any).typeAnnotation
        ? this.extractTypeString((param as any).typeAnnotation.typeAnnotation)
        : undefined;

      return {
        name: paramName,
        type: paramType,
        optional: param.optional || false
      };
    });

    // FIX: Check if returnType exists AND is not Noop
    const returnTypeNode = node.returnType;
    const returnType = returnTypeNode && !t.isNoop(returnTypeNode)
      ? this.extractTypeString((returnTypeNode as any).typeAnnotation)
      : undefined;

    const calledFunctions = this.extractCalledFunctions(path);

    return {
      name: node.id?.name || 'anonymous',
      parameters,
      returnType,
      isAsync: node.async || false,
      calledFunctions
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS - EXTRACT CALLED FUNCTIONS
  // ═════════════════════════════════════════════════════════════════════════════

  private extractCalledFunctions(path: NodePath): string[] {
    const calledFunctions = new Set<string>();

    path.traverse({
      CallExpression: (callPath: NodePath) => {
        const callee = (callPath.node as t.CallExpression).callee;
        let functionName = '';

        if (t.isIdentifier(callee)) {
          functionName = callee.name;
        } else if (t.isMemberExpression(callee)) {
          if (t.isIdentifier((callee as t.MemberExpression).property)) {
            functionName = ((callee as t.MemberExpression).property as t.Identifier).name;
          }
        }

        if (functionName && !this.isKeyword(functionName)) {
          calledFunctions.add(functionName);
        }
      }
    });

    return Array.from(calledFunctions);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS - EXTRACT FUNCTION CONTEXT
  // ═════════════════════════════════════════════════════════════════════════════

  private extractFunctionContext(path: NodePath): FunctionContext {
    const usedVariables = new Set<string>();
    const declaredVariables = new Set<string>();
    const externalDependencies = new Set<string>();
    const thrownErrors = new Set<string>();

    path.traverse({
      VariableDeclarator: (varPath: NodePath) => {
        const node = varPath.node as t.VariableDeclarator;
        if (t.isIdentifier(node.id)) {
          declaredVariables.add(node.id.name);
        }
      },

      Identifier: (idPath: NodePath) => {
        const name = (idPath.node as t.Identifier).name;
        if (name && !this.isKeyword(name)) {
          usedVariables.add(name);
        }
      },

      MemberExpression: (memberPath: NodePath) => {
        const node = memberPath.node as t.MemberExpression;
        if (t.isIdentifier(node.object)) {
          externalDependencies.add(node.object.name);
        }
      },

      ThrowStatement: (throwPath: NodePath) => {
        const node = throwPath.node as t.ThrowStatement;
        if (t.isNewExpression(node.argument)) {
          const newExpr = node.argument as t.NewExpression;
          if (t.isIdentifier(newExpr.callee)) {
            thrownErrors.add(newExpr.callee.name);
          } else {
            thrownErrors.add('Error');
          }
        }
      }
    });

    return {
      usedVariables: Array.from(usedVariables),
      declaredVariables: Array.from(declaredVariables),
      externalDependencies: Array.from(externalDependencies),
      thrownErrors: Array.from(thrownErrors)
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS - EXTRACT CLASS PROPERTIES
  // ═════════════════════════════════════════════════════════════════════════════

  private extractClassProperties(node: t.ClassDeclaration): PropertyInfo[] {
    const properties: PropertyInfo[] = [];

    node.body.body.forEach(member => {
      if (t.isClassProperty(member) && t.isIdentifier(member.key)) {
        const propName = member.key.name;
        const typeStr = (member as any).typeAnnotation
          ? this.extractTypeString((member as any).typeAnnotation.typeAnnotation)
          : undefined;

        properties.push({
          name: propName,
          type: typeStr,
          accessLevel: (member as any).accessibility || 'public',
          isOptional: member.optional || false
        });
      }
    });

    return properties;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS - EXTRACT CLASS METHODS
  // ═════════════════════════════════════════════════════════════════════════════

  private extractClassMethods(
    node: t.ClassDeclaration,
    path: NodePath,
    classId: string
  ): MethodInfo[] {
    const methods: MethodInfo[] = [];

    node.body.body.forEach(member => {
      if (t.isClassMethod(member) && t.isIdentifier(member.key)) {
        const methodName = member.key.name;
        const methodId = `${classId}.${methodName}`;

        const params = member.params || [];
        const parameters = params.map((param: any) => ({
          name: t.isIdentifier(param) ? param.name : 'unknown',
          type: (param as any).typeAnnotation
            ? this.extractTypeString((param as any).typeAnnotation.typeAnnotation)
            : undefined,
          optional: param.optional || false
        }));

        // FIX: Same guard for returnType
        const returnTypeNode = (member as any).returnType;
        const returnType = returnTypeNode && !t.isNoop(returnTypeNode)
          ? this.extractTypeString(returnTypeNode.typeAnnotation)
          : undefined;

        const signature: FunctionSignature = {
          name: methodName,
          parameters,
          returnType,
          isAsync: member.async || false,
          calledFunctions: []
        };

        methods.push({
          name: methodName,
          signature,
          accessLevel: (member as any).accessibility || 'public',
          isStatic: member.static || false,
          isAsync: member.async || false
        });
      }
    });

    return methods;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS - GRAPH OPERATIONS
  // ═════════════════════════════════════════════════════════════════════════════

  private addNodeToGraph(graph: EnhancedCodeGraph, node: EnhancedCodeNode): void {
    graph.nodes.set(node.id, node);

    const fileNodes = graph.fileToNodes.get(node.filePath) || [];
    fileNodes.push(node.id);
    graph.fileToNodes.set(node.filePath, fileNodes);

    const nameNodes = graph.nameToNodes.get(node.name) || [];
    nameNodes.push(node.id);
    graph.nameToNodes.set(node.name, nameNodes);
  }

  private addEdgeToGraph(
    graph: EnhancedCodeGraph,
    source: string,
    target: string,
    type: string
  ): void {
    const edges = graph.edges.get(source) || [];
    edges.push({
      source,
      target,
      type
    });
    graph.edges.set(source, edges);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS - UTILITY FUNCTIONS
  // ═════════════════════════════════════════════════════════════════════════════

  private isNodeExported(path: NodePath): boolean {
    if (path.parent && t.isExportNamedDeclaration(path.parent)) {
      return true;
    }
    if (path.parent && t.isExportDefaultDeclaration(path.parent)) {
      return true;
    }
    return false;
  }

  private extractModifiers(node: any): string[] {
    const modifiers: string[] = [];

    if (node.async) modifiers.push('async');
    if (node.static) modifiers.push('static');
    if ((node as any).accessibility) modifiers.push((node as any).accessibility);

    return modifiers;
  }

  private extractTypeString(typeNode: any): string {
    if (!typeNode) return 'any';

    if (t.isTSStringKeyword(typeNode)) return 'string';
    if (t.isTSNumberKeyword(typeNode)) return 'number';
    if (t.isTSBooleanKeyword(typeNode)) return 'boolean';
    if (t.isTSNullKeyword(typeNode)) return 'null';
    if (t.isTSUndefinedKeyword(typeNode)) return 'undefined';
    if (t.isTSVoidKeyword(typeNode)) return 'void';

    if (t.isTSArrayType(typeNode)) {
      return `${this.extractTypeString(typeNode.elementType)}[]`;
    }

    if (t.isTSUnionType(typeNode)) {
      const types = typeNode.types.map((t: any) => this.extractTypeString(t));
      return types.join(' | ');
    }

    if (t.isTSIntersectionType(typeNode)) {
      const types = typeNode.types.map((t: any) => this.extractTypeString(t));
      return types.join(' & ');
    }

    if (t.isTSTypeReference(typeNode)) {
      if (t.isIdentifier(typeNode.typeName)) {
        return typeNode.typeName.name;
      }
    }

    if (t.isTSLiteralType(typeNode)) {
      if (typeNode.literal) {
        if (t.isStringLiteral(typeNode.literal)) {
          return `"${typeNode.literal.value}"`;
        }
        if (t.isNumberLiteral(typeNode.literal)) {
            return (typeNode.literal as t.NumericLiteral).value.toString();
        }
        if (t.isBooleanLiteral(typeNode.literal)) {
          return typeNode.literal.value ? 'true' : 'false';
        }
        if (t.isBigIntLiteral(typeNode.literal)) {
            return `${(typeNode.literal as t.BigIntLiteral).value}n`;
        }
      }
    }

    return 'any';
  }

  private isKeyword(name: string): boolean {
    const keywords = [
      'this', 'super', 'new', 'delete', 'typeof', 'instanceof',
      'in', 'of', 'void', 'return', 'break', 'continue', 'await',
      'yield', 'import', 'export', 'default', 'class', 'function'
    ];
    return keywords.includes(name);
  }
}
