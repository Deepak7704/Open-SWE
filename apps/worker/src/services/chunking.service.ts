import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as fs from 'fs';
import * as path from 'path';


// If we need to add python chunking then we need to add few functions that helps to chunk the code
/**
 * Interface for a code chunk
 * This is what we'll store, embed and index using BM-25
 */

export interface CodeChunk{
    id : string; // unique id for each fn eg - "filepath_fn_fnName"
    filePath : string;  // relative path from repo root
    fileName : string;
    fileType : string; // extension of file (.ts,.js,.py)
    functionName : string | null; //name of the function / class (null if it is line based chunking)
    lineStart : number;
    lineEnd : number;
    content : string;
    chunkType :"function" | "class" | "lines"; // the type of this chunk
}
export class ChunkingService{

    /**
   * Main entry point: Chunk a single file
   * 
   * @param content - Full file content as string
   * @param filePath - Relative path (e.g., "src/controllers/products.controller.ts")
   * @param fileType - Extension (e.g., ".ts")
   * @returns Array of code chunks
   */
    chunkFile(
        content : string,
        filePath : string,
        fileType : string
    ):CodeChunk[]{
        console.log(`chunking file:${filePath}`);
        //routing to appropriate chunker based on file type
        if(['.ts','.js','.tsx','.jsx'].includes(fileType)){
            return this.chunkJavaScriptFile(content,filePath,fileType);
        }else{
            return this.chunkByLines(content,filePath,fileType);
        }
    }

    // chunk js/ts files using ast parsing that uses babel parser to extract functions and classes

    private chunkJavaScriptFile(content:string,filePath:string,fileType:string):CodeChunk[]{
        const chunks : CodeChunk[] =[];
        try{
            // parse code into abstarct syntax tree(AST)
            // this converts the code content string into a tree
            const ast = parse(content,{
                sourceType:'module',
                plugins:['typescript','jsx'], // supports ts and jsx
                errorRecovery:true // continue parsing despite errors
            });
            console.log('Ast parsed successufully');
            traverse(ast,{
                // this function helps to extract regular functions
                FunctionDeclaration(nodePath){
                    const node = nodePath.node;
                    if(!node.loc) return; 
                    // the above condition skips the node if there is no location information of the funciton
                    chunks.push({
                        id:`${filePath}_fn${node.id?.name || 'anonymous'}`,
                        filePath : filePath,
                        fileName : path.basename(filePath), 
                        fileType : fileType,
                        functionName : node.id?.name || 'anonymous',
                        lineStart:node.loc.start.line,
                        lineEnd : node.loc.end.line,
                        content : content.substring(node.start!,node.end!),
                        chunkType:'function'
                    });
                    console.log(`    → Function: ${node.id?.name} (lines ${node.loc.start.line}-${node.loc.end.line})`);
                },
                //extract arrow functions
                VariableDeclarator(nodePath){
                    const node = nodePath.node;
                    //checks if the variable is a function
                    if(node.init && (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')){
                        if(!node.loc) return;

                        //get the function name/variable name
                        const functionName = node.id.type === 'Identifier'?node.id.name :'anonymous';

                        chunks.push({
                            id: `${filePath}_fn_${functionName}`,
                            filePath: filePath,
                            fileName: path.basename(filePath),
                            fileType: fileType,
                            functionName: functionName,
                            lineStart: node.loc.start.line,
                            lineEnd: node.loc.end.line,
                            content: content.substring(node.start!, node.end!),
                            chunkType: 'function'
                        });
                        console.log(`    → Arrow Function: ${functionName} (lines ${node.loc.start.line}-${node.loc.end.line})`);
                    }
                },
                ClassDeclaration(nodePath){
                    const node = nodePath.node;
                    if(!node.loc) return;
                    chunks.push({
                        id: `${filePath}_class_${node.id?.name}`,
                        filePath: filePath,
                        fileName: path.basename(filePath),
                        fileType: fileType,
                        functionName: node.id?.name || '',
                        lineStart: node.loc.start.line,
                        lineEnd: node.loc.end.line,
                        content: content.substring(node.start!, node.end!),
                        chunkType: 'class'
                    });
                    console.log(`    → Class: ${node.id?.name} (lines ${node.loc.start.line}-${node.loc.end.line})`);
                }
            });
        }catch(error){
            console.error(`AST parse failed ${error}`);
            console.log('Falling back to line based chunking');
            return this.chunkByLines(content,filePath,fileType);
        }
        if(chunks.length === 0){
            console.log(`No functions/classes found using line based chunking`);
            return this.chunkByLines(content,filePath,fileType);
        }
        console.log(`created ${chunks.length} chunks`);
        return chunks;
 
    }
    private chunkByLines(
        content:string,
        filePath : string,
        fileType : string,
        linesPerChunk : number = 100
    ):CodeChunk[]{
        const chunks : CodeChunk[] =[];
        const lines = content.split('\n');
        console.log('Line based chunking');
        for(let i=0;i<lines.length;i+=linesPerChunk){
            const chunkLines = lines.slice(i,i+linesPerChunk);
            const chunkContent = chunkLines.join('\n');

            const chunk:CodeChunk={
                id: `${filePath}_lines_${i + 1}_${i + chunkLines.length}`,
                filePath: filePath,
                fileName: path.basename(filePath),
                fileType: fileType,
                functionName: null, // No function name for line-based chunks
                lineStart: i + 1,
                lineEnd: i + chunkLines.length,
                content: chunkContent,
                chunkType: 'lines'
            };
            chunks.push(chunk);
            console.log(`    → Lines ${i + 1}-${i + chunkLines.length}`);
        }
        console.log(`  ✓ Created ${chunks.length} line-based chunks`);
        return chunks;
    }

}