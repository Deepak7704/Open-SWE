import { Router } from "express";
import crypto from 'crypto';
const router = Router();

// state management (CSRF protection)
const oauthStates = new Map<string,{
    timestamp:number;
    userId?: string;}>();