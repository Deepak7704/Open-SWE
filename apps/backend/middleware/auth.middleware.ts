import type {Request,Response,NextFunction} from 'express';
import {verifySessionToken} from '../lib/jwt_manager';
import {verifySession} from '../lib/session_manager';

//extract jwt from authorization header
// extracts sessionId from jwt
//fetch user session and attach user to request

export async function authenticateUser(req:Request,res:Response,next:NextFunction):Promise<void>{
    try{
        const authHeader = req.headers.authorization;
        if(!authHeader){
            console.log(`[Auth Middleware] REJECTED ${req.method} ${req.path} - No authorization header`);
            res.status(401).json({
                error : 'Unauthorized',
                message:'No authorization header provided',
                code:'NO_AUTHENTICATION_HEADER'
            });
            return;
        }
        if(!authHeader.startsWith('Bearer ')){
            console.log(`[Auth Middleware] REJECTED ${req.method} ${req.path} - Invalid header format: ${authHeader.substring(0, 20)}...`);
            res.status(401).json({
                error:'Unauthorized',
                message:'Invalid authorization header format',
                code:'INVALID_AUTHENTICATION_FORMAT'
            })
            return;
        }
        const token = authHeader.split(' ')[1];
        if(!token){
            console.log(`[Auth Middleware] REJECTED ${req.method} ${req.path} - No token in header`);
            res.status(401).json({
                error:'Unauthorized',
                message:'No authentication token provided',
                code:'NO_TOKEN_PROVIDED'
            })
            return;
        }
        let decoded;
        try{
            decoded = verifySessionToken(token);
        }catch(error){
            console.log(`[Auth Middleware] REJECTED ${req.method} ${req.path} - Invalid/expired token:`, error);
            res.status(401).json({
                error: 'Unauthorized',
                message:"Invalid token or session expired",
                code: 'INVALID_TOKEN'
            });
            return;
        }
        let session;
        try{
            session = await verifySession(decoded.sessionId);
        }catch(error){
            console.error(`[Auth Middleware] REJECTED ${req.method} ${req.path} - Session not found: ${decoded.sessionId}`);
            res.status(401).json({
                error: 'Unauthorized',
                message:"Session not found or expired",
                code: 'SESSION_EXPIRED'
            });
            return;
        }
        req.user = {
            userId : session.userId,
            username : session.username,
            email : session.email,
            name : session.name,
            avatar : session.avatar,
            profileUrl : session.profileUrl,
            sessionId : session.sessionId,
            githubAccessToken : session.githubAccessToken,
            createdAt : session.createdAt,
            expiredAt :
            session.expiredAt
        };
        console.log(`[Auth Middleware] ✓ AUTHENTICATED ${req.method} ${req.path} - User: ${session.username} (${session.userId})`);
        next();
    }catch(error){
        console.error(`[Auth Middleware] ERROR ${req.method} ${req.path} -`,error);
        res.status(500).json({
            error: 'Internal Server Error',
            message : "Authentication failed due to internal server error"
        });
    }
}