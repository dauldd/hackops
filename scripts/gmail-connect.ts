// Run locally with Node 24. Credentials are read from .env, never printed.
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const client=process.env.GMAIL_CLIENT_ID,secret=process.env.GMAIL_CLIENT_SECRET;
if(!client||!secret)throw Error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first.');
const redirect='http://localhost:53682/oauth2/callback';
const state=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');
const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
url.search=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/gmail.send',access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
const server=createServer(async(req,res)=>{
 const callback=new URL(req.url??'/',redirect);
 if(callback.pathname!=='/oauth2/callback'||callback.searchParams.get('state')!==state){res.writeHead(400).end('Invalid callback.');return;}
 try{
 const code=callback.searchParams.get('code');if(!code)throw Error('Authorization declined.');
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:client!,client_secret:secret!,redirect_uri:redirect,grant_type:'authorization_code',code,code_verifier:verifier}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok||!data.refresh_token)throw Error('No refresh token returned. Revoke this app in your Google account and run setup again.');
 await writeFile('.env.gmail',`GMAIL_REFRESH_TOKEN=${data.refresh_token}\n`,{mode:0o600,flag:'wx'});
 res.end('Gmail connected. You can close this tab.');console.log('Saved refresh token to .env.gmail. Copy its line into .env, then delete .env.gmail. Restart the app.');
 }catch(error){res.writeHead(400).end('Setup failed. See terminal.');console.error(error instanceof Error?error.message:'Setup failed.');process.exitCode=1;}
 finally{server.close();clearTimeout(timeout);}
});
const timeout=setTimeout(()=>{console.error('Authorization timed out. Run setup again.');server.close();},300000);
server.listen(53682,'127.0.0.1',()=>console.log(`Open this URL in your browser and choose your sending account:\n${url}`));
