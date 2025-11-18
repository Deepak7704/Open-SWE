import { Router } from "express";
import { verifyWebhookSignature } from '../lib/github_app';

const router = Router();
interface Installation{
    installationId : number;
    accountLogin : string;
    accountType : 'User' | 'Organization';
    repositories:{
        id:number;
        name : string;
        fullName:string;
        private:boolean;
    }[];
    installedAt:string;
    updatedAt:string;
}
//temp - inmemory storage
const repoToInstallation = new Map<string,number>();
const installations = new Map<number,Installation>();

router.post('/',async(req,res)=>{
    try{
        const signature = req.header('X-Hub-Signature-256') || '';
        const event = req.header('X-GitHub-Event') || '';
        const deliveryId = req.header('X-GitHub-Delivery') || '';
        const body = req.body;
        const rawBody = (req as any).rawBody as Buffer;
         console.log(`\n[Installation] ${event} | Delivery: ${deliveryId}`);
        if(!await verifyWebhookSignature(rawBody,signature)){
            console.error('Invalid signature');
            return res.status(403).json({error:'Invalid signature'});
        }
        if(event==='installation' && body.action === 'created'){
            const installationId = body.installation.id;
            const account = body.installation.account;
            const repositories = body.repositories || [];
            console.log('App installed');
            const installation:Installation={
                installationId,
                accountLogin:account.login,
                accountType:account.type,
                repositories:repositories.map((repo:any)=>({
                    id:repo.id,
                    name : repo.name,
                    fullName : repo.full_name,
                    private : repo.private
                })),
                installedAt:new Date().toISOString(),
                updatedAt:new Date().toISOString(),
            };
            installations.set(installationId,installation);
            repositories.forEach((repo:any)=>{
                repoToInstallation.set(repo.full_name,installationId);
                console.log(`[Installation]    ${repo.full_name} → ${installationId}`)
            });
            return res.status(200).json({
                message:'Installation created',
                installationId,
                repositories:repositories.length,
            });
        }
        if(event === 'installation' && body.action ==='deleted'){
            const installationId = body.installation.id;
            const account = body.installation.account;
            console.log(`[Installation] Uninstalled by ${account.login}`);
            //remove all mappings
            const installation = installations.get(installationId);
            if(installation){
                installation.repositories.forEach(repo=>{
                    repoToInstallation.delete(repo.fullName);
                });
                installations.delete(installationId);
            }
            return res.status(200).json({
                message:'Deleted',
                installationId
            });
        }
        //Repositories added to installation 
        if(event === 'installation_repositories' && body.action === 'added'){
            const installationId = body.installation.id;
            const addRepos = body.repositories_added || [];
            console.log(`[Installation]${addRepos.length} repos added to ${installationId}`);
            const installation = installations.get(installationId);
            if(installation){
                addRepos.forEach((repo:any)=>{
                    installation.repositories.push({
                        id:repo.id,
                        name:repo.name,
                        fullName:repo.fullName,
                        private:repo.private,
                    });
                    repoToInstallation.set(repo.full_name,installationId);
                    console.log(`[Installation] ${repo.full_name} -> ${installationId}`);
                    
                });
                installation.updatedAt = new Date().toISOString();
            }
            return res.status(200).json({
                message:'Repositories added',
                installationId,
                added:addRepos.length
            });
        }
        if(event === 'installation_repositories' && body.action === 'removed'){
            const installationId = body.installation.id;
            const removedRepos = body.repositories_removed || [];
            console.log(`${removedRepos.length} repos removed from ${installationId}`);
            const installation = installations.get(installationId);
            if(installation){
                removedRepos.forEach((repo:any)=>{
                    installation.repositories = installation.repositories.filter(r => r.fullName !== repo.full_name);

                    repoToInstallation.delete(repo.full_name);
                });
                installation.updatedAt = new Date().toISOString();
            }
            return res.status(200).json({
                message:'Removed Repositories',
                installationId,
                removed:removedRepos.length,
            });
        }
        console.log(`Unhandled events`);
        return res.status(200).json({message:'Event not handled',event});
    }catch(error:any){
        console.error('Installation error',error.message);
        return res.status(500).json({
            error:'Processing Failed'
        });
    }
});

export function getInstallationForRepo(repoFullName:string):number | null{
    return repoToInstallation.get(repoFullName) || null;
}
// GET /list route - Returns a list of all installations
router.get('/list', (req, res) => {
  // Convert the installations Map into an array
  const installationList = Array.from(installations.values()).map(install => ({
    installationId: install.installationId,   // Unique ID of the installation
    account: install.accountLogin,            // Account login name (e.g., GitHub username)
    type: install.accountType,                // Account type (e.g., 'User' or 'Organization')
    repositories: install.repositories.length, // Number of repositories installed
    repos: install.repositories.map(r => r.fullName), // List of repository full names
    installedAt: install.installedAt          // Installation timestamp
  }));

  // Send JSON response containing total and detailed list
  res.json({
    total: installationList.length,  // Total number of installations
    installations: installationList  // Array of installation objects
  });
});

export default router;
export {repoToInstallation,installations};