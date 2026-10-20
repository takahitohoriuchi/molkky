import http from 'node:http';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve, extname, sep} from 'node:path';
const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.csv':'text/csv; charset=utf-8','.mp4':'video/mp4'};
http.createServer(async(req,res)=>{
  try {
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!path.startsWith(root+sep)||pathname.split('/').some(s=>s.startsWith('.'))){res.writeHead(403).end();return;}
    const info=await stat(path);if(!info.isFile()){res.writeHead(404).end();return;}
    let start=0,end=info.size-1,status=200;
    const headers={'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
    if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      if(!match[1])start=Math.max(0,info.size-Number(match[2]));else{start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
      if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
    }
    headers['Content-Length']=Math.max(0,end-start+1);res.writeHead(status,headers);
    if(req.method==='HEAD'||info.size===0){res.end();return;}
    const stream=createReadStream(path,{start,end});stream.on('error',()=>res.destroy());req.on('close',()=>stream.destroy());stream.pipe(res);
  }catch{res.writeHead(404).end('Not found');}
}).listen(5173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5173'));
