import type { GenerateOutput } from "@openswe/shared/types";

export interface RepoContext{
    fileContents:Map<string,string>;
    relevantFiles:String[];
    codeSkeletons:Map<string,string>;
    packageManager:String;
}
export interface ValidationCheck{
    passed : boolean;
    errors : string[];
}
export interface TestValidationCheck extends ValidationCheck{
    passCount : number;
    failCount : number;
}

export interface ValidationResult{
    allPassed : boolean;
    score : number;
    errorCount : number;
    checks:{
        syntax:ValidationCheck;
        types:ValidationCheck;
        tests:TestValidationCheck;
        build?:ValidationCheck;
    };
    executionTime : number;
}
//D
export interface IteraionHistory{
    iteration : number;
    validationResult : ValidationResult;
}
export interface WorkflowResult{
    finalCode : GenerateOutput;
    validationResults : ValidationResult;
    iterations : number;
    decision : 'SHIP' | 'FAIL';
    stopReason : string;
    history : IteraionHistory[];
}
export type WorkflowDecision = 'CONTINUE' | 'SHIP' | 'FAIL';
