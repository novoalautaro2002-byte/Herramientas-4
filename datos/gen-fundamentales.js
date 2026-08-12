/* Genera el bloque de balances que se embebe en la app.
   Correr cuando salgan resultados trimestrales:  node gen-fund.js            */
const fs=require('fs');
const {serieEPS,normalizar,ttmDe,validarTTM,ajustePorSplits,splitsDe,UA}=require('./fund.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const USD=['AAPL','MSFT','GOOGL','META','ORCL','PLTR','GLOB','NVDA','AVGO','AMD','TSM','AMZN','TSLA',
           'MCD','MELI','NKE','KO','WMT','JPM','BAC','GS','NU','V','COIN','LLY','JNJ','XOM','CVX',
           'VIST','CAT','B','VALE','NFLX'];
const ARGY=['YPF','GGAL','BMA','SUPV','BBAR','PAM','EDN','CEPU','TGS','CRESY','IRS','LOMA','TEO','DESP','BIOX','AGRO','MELI','VIST'];
(async()=>{
  const mapa=await (await fetch('https://www.sec.gov/files/company_tickers.json',{headers:UA})).json();
  const cikDe={}; Object.values(mapa).forEach(x=>cikDe[x.ticker]=String(x.cik_str).padStart(10,'0'));
  const salida={}, fallas=[];
  const todos=[...new Set([...USD,...ARGY])];
  for(const t of todos){
    await sleep(160);
    const cik=cikDe[t];
    if(!cik){ fallas.push([t,'sin CIK en EDGAR']); continue; }
    let facts;
    try{ const j=await (await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,{headers:UA})).json(); facts=j.facts; }
    catch(e){ fallas.push([t,'no respondió la SEC']); continue; }
    if(!facts){ fallas.push([t,'sin balances etiquetados']); continue; }
    const cruda=serieEPS(facts);
    if(!cruda){ fallas.push([t,'no etiqueta EPS en XBRL']); continue; }
    if(!/^USD/.test(cruda.moneda)){ fallas.push([t,'balances en '+cruda.moneda.split('/')[0]]); continue; }
    const N=normalizar(cruda,ajustePorSplits(await splitsDe(t)));
    const V=validarTTM(ttmDe(N.q),N.anu);
    if(V.serie.length<8){ fallas.push([t,'sólo '+V.serie.length+' trimestres encadenables']); continue; }
    salida[t]={
      ttm: V.serie.map(x=>[x.fecha,+x.eps.toFixed(4)]),
      desc: V.descartados, der: N.q.filter(x=>x.derivado).length
    };
  }
  const meta={generado:new Date().toISOString().slice(0,10),papeles:Object.keys(salida).length};
  const json=JSON.stringify({meta,datos:salida});
  fs.writeFileSync('fundamentales.json',json);
  console.log('\n✓ '+meta.papeles+' papeles · '+(json.length/1024).toFixed(0)+' KB');
  console.log('  cobertura: '+meta.papeles+'/'+todos.length);
  if(fallas.length){ console.log('\n  sin datos utilizables:'); fallas.forEach(([t,m])=>console.log('   '+t.padEnd(7)+m)); }
  const largos=Object.entries(salida).map(([k,v])=>[k,v.ttm.length]).sort((a,b)=>a[1]-b[1]);
  console.log('\n  series más cortas: '+largos.slice(0,5).map(x=>x[0]+' '+x[1]).join(', '));
  console.log('  último dato más viejo: '+Object.entries(salida).map(([k,v])=>[k,v.ttm[v.ttm.length-1][0]]).sort((a,b)=>a[1]<b[1]?-1:1).slice(0,5).map(x=>x[0]+' '+x[1]).join(', '));
})();
