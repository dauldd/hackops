export async function register(){if(process.env.NEXT_RUNTIME==='nodejs'){const {wakeVideoWorker}=await import('./lib/video/worker');wakeVideoWorker();}}
