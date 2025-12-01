import crypto from 'crypto';
import {connection} from '@openswe/shared/queues';

//prefix for all session keys in redis
//avoids conflicts with other data that is stored in redis
const SESSION_PREFIX = 'session:';
const SESSION_EXPIRE_DAYS = Number(process.env.SESSION_EXPIRE_DAYS);
if(!SESSION_EXPIRE_DAYS){
    throw new Error('Session expire days must be set!!');
}
const SESSION_EXPIRE_MS = SESSION_EXPIRE_DAYS * 24 * 60 * 60 * 1000;

//Type Definitions
interface SessionData{
    userId : number;
    username : string;
    email : string;
    githubAccessToken : string;
    name : string | null;
    avatar : string;
    profileUrl : string;
}
interface Session extends SessionData{
    sessionId : string; //unique session identifier
    createdAt : number;
    expiredAt : number;
}

// a helper fn that helps to generates cryptographically secure random session id 
function generateSessionId():string{
    const randomBytes = crypto.randomBytes(32);
    const randomString = randomBytes.toString('base64url').slice(0,32);
    return `sess_${randomString}`;
}
export async function createSession(data:SessionData):Promise<string>{
    const sessionId = generateSessionId();
    const now = Date.now();//gets the current time stamp
    const expiredAt = now + SESSION_EXPIRE_MS;
    const session : Session = {
        ...data,//copy userId,uname,email and add sessid,timestamps,githubaccess token
        sessionId,
        createdAt:now,
        expiredAt
    }
    //format => "session:sess_abakldklj3i489273"
    const redisKey = `${SESSION_PREFIX}${sessionId}`;
    //redis stores strings so we must serialize them
    const sessionJson = JSON.stringify(session);
    //calculate ttl in seconds
    const ttlSeconds = Math.floor(SESSION_EXPIRE_MS/1000);
    try{
        await connection.setex(redisKey,ttlSeconds,sessionJson);
        console.log(`[Session] Created session ${sessionId} for user
        ${data.username}, expires in ${SESSION_EXPIRE_DAYS} days`);
    }catch(error){
        console.error('[Session] Failed to create a session',error);
        throw new Error('Failed to create session');
    }
    return sessionId;
}
export async function getSession(sessionId:string):Promise<Session|null>{
    //validate input
    if(!sessionId || sessionId.trim() === ''){
        console.log('[Session] getSession called with empty sessionid');
        return null;
    }
    const redisKey = `${SESSION_PREFIX}${sessionId}`;
    try{
        const sessionJson = await connection.get(redisKey);
        if(!sessionJson){
            console.log(`[Session] Session ${sessionId} not found`);
            return null;
        }
        //Deserialize into JSON
        const session = JSON.parse(sessionJson) as Session;
        return session;
    }catch(error){
        console.error(`[Session] Error retrieving session ${sessionId}`,error);

        return null;
    }
}
export async function deleteSession(sessionId:string):Promise<boolean>{
    if(!sessionId || sessionId.trim() === ''){
        console.warn('[Session] deleteSession called with empty sessionId');
        return false;
    }
    const redisKey = `${SESSION_PREFIX}${sessionId}`;
    try{
        const deleteCount = await connection.del(redisKey);
        if(deleteCount>0){
            console.log(`Session deleted session ${sessionId}`);
            return true;
        }else{
            console.log(`[Session] Session ${sessionId} did not exist`);
            return false;
        }
    }catch(error){
        console.error(`[Session] Session ${sessionId} did not exist`);
        return false;
    }
}
export async function verifySession(sessionId:string):Promise<Session>{
    const session = await getSession(sessionId);
    if(!session){
        //session not found in redis
        throw new Error('Session not found or expired');
    }
    const now = Date.now();
    if(now > session.expiredAt){
        await deleteSession(sessionId);
        throw new Error('Session expired');
    }
    return session;
}
/**
 * SECURITY: Cleanup expired sessions using SCAN instead of KEYS
 * KEYS command blocks Redis and causes performance issues in production
 * SCAN is non-blocking and iterates through keys without freezing Redis
 */
export async function cleanupExpiredSessions():Promise<number>{
    let cleanedCount = 0;
    try{
        const pattern = `${SESSION_PREFIX}*`;
        let cursor = '0';
        const now = Date.now();

        // Use SCAN instead of KEYS to avoid blocking Redis
        // SCAN iterates through keys without blocking other operations
        do {
            // SCAN returns [cursor, keys] tuple
            // cursor '0' means iteration is complete
            const result = await connection.scan(
                cursor,
                'MATCH', pattern,
                'COUNT', 100  // Process 100 keys at a time
            );

            cursor = result[0];
            const keys = result[1];

            // Process each batch of keys
            for(const key of keys){
                const sessionJson = await connection.get(key);
                if(sessionJson){
                    const session = JSON.parse(sessionJson) as Session;
                    if(now > session.expiredAt){
                        await connection.del(key);
                        cleanedCount++;
                    }
                }
            }
        } while (cursor !== '0');

        if(cleanedCount > 0){
            console.log(`[Session] cleaned up ${cleanedCount} expired sessions`);
        }
        return cleanedCount;
    }catch(error){
        console.error('[Session] Error during cleanup',error);
        return cleanedCount;
    }
}

