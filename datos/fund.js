// Prototipo del armado de EPS TTM ajustado por splits, para validar antes de integrar.
const UA={'User-Agent':'analisis-tecnico novoa.lautaro.2002@gmail.com'};
const dias=(a,b)=>Math.round((new Date(b)-new Date(a))/86400000);

function serieEPS(facts){
  const ordenTags=[['us-gaap','EarningsPerShareDiluted'],['us-gaap','EarningsPerShareBasic'],
                   ['ifrs-full','DilutedEarningsLossPerShare'],['ifrs-full','BasicEarningsLossPerShare']];
  let pts=null,moneda=null;
  for(const [tax,tag] of ordenTags){
    const nodo=facts[tax]&&facts[tax][tag]; if(!nodo) continue;
    const u=Object.keys(nodo.units).find(x=>/^USD/.test(x))||Object.keys(nodo.units)[0];
    const arr=(nodo.units[u]||[]).filter(x=>x&&x.start&&x.end&&typeof x.val==='number'&&x.filed);
    if(arr.length<4) continue;
    pts=arr;moneda=u;break;
  }
  if(!pts) return null;
  // una sola versión por período: la presentación más reciente
  const porPer={};
  pts.forEach(x=>{const k=x.start+'_'+x.end; if(!porPer[k]||x.filed>porPer[k].filed) porPer[k]=x;});
  const todos=Object.values(porPer);
  return {
    trim: todos.filter(x=>{const d=dias(x.start,x.end);return d>=80&&d<=100;}).sort((a,b)=>a.end<b.end?-1:1),
    anu : todos.filter(x=>{const d=dias(x.start,x.end);return d>=330&&d<=400;}).sort((a,b)=>a.end<b.end?-1:1),
    moneda
  };
}

/**
 * Lleva todo a las acciones de hoy y recién ahí deriva el trimestre faltante.
 *
 * El orden importa: el ejercicio y sus trimestres suelen venir de presentaciones
 * distintas, y si un split cae en el medio quedan en bases diferentes. Restarlos
 * crudos daba TTM negativos contra ejercicios positivos (GOOGL 2020: -31,65 contra
 * 2,93 reportado).
 */
function normalizar(s, aj){
  const ap = x => Object.assign({}, x, { val: x.val / aj(x.filed) });
  const trim = s.trim.map(ap), anu = s.anu.map(ap);

  // El Q4 no se presenta como 10-Q: se deriva restando los tres trimestres al ejercicio
  const derivados=[];
  anu.forEach(a=>{
    const dentro=trim.filter(q=>q.start>=a.start&&q.end<=a.end).sort((x,y)=>x.end<y.end?-1:1);
    if(dentro.length!==3) return;
    const ultQ=dentro[2], hueco=dias(ultQ.end,a.end);
    if(hueco<70||hueco>100) return;
    derivados.push({start:ultQ.end,end:a.end,filed:a.filed,derivado:true,
                    val:+(a.val-dentro.reduce((t,x)=>t+x.val,0)).toFixed(4)});
  });
  return { q: trim.concat(derivados).sort((x,y)=>x.end<y.end?-1:1), anu, moneda:s.moneda };
}

/** Serie de EPS de los últimos 12 meses: suma móvil de 4 trimestres consecutivos. */
function ttmDe(q){
  const out=[];
  for(let i=3;i<q.length;i++){
    const w=q.slice(i-3,i+1);
    let ok=true;
    for(let k=1;k<w.length;k++){const g=dias(w[k-1].end,w[k].start); if(g<-3||g>5) ok=false;}
    const span=dias(w[0].start,w[3].end);
    if(span<330||span>400) ok=false;
    if(ok) out.push({fecha:w[3].end,eps:+w.reduce((a,x)=>a+x.val,0).toFixed(4)});
  }
  return out;
}

/**
 * Descarta los ejercicios cuyo TTM no cierra contra el anual reportado.
 *
 * El anual es la cifra auditada y reexpresada; si la suma de los cuatro trimestres
 * no le da, es que hubo una reexpresión (típicamente operaciones discontinuadas)
 * que tocó el ejercicio pero no los trimestres. Pasa en el 3% de los ejercicios.
 * Antes que publicar un EPS que sé que está mal, se saca ese tramo.
 */
function validarTTM(ttm, anu, tol){
  tol = tol || 0.03;
  const porFin = {}; ttm.forEach(x => porFin[x.fecha] = x.eps);
  const malos = [];
  anu.forEach(a => {
    const t = porFin[a.end];
    if(t == null) return;
    if(Math.abs(t - a.val) > Math.max(0.05, Math.abs(a.val) * tol)) malos.push(a);
  });
  if(!malos.length) return { serie: ttm, descartados: 0 };
  // se cae todo el ejercicio conflictivo, no sólo el punto de cierre
  const fuera = f => malos.some(a => f > a.start && f <= a.end);
  const serie = ttm.filter(x => !fuera(x.fecha));
  return { serie, descartados: ttm.length - serie.length, ejercicios: malos.length };
}

/**
 * Factor para llevar un EPS a las acciones de hoy.
 *
 * Se mide contra la FECHA DE PRESENTACIÓN, no contra el cierre del período: dentro
 * de una misma empresa conviven cifras pre y post split, porque un período viejo
 * sólo queda reexpresado si volvió a aparecer como comparativo en una presentación
 * posterior al split. Los trimestres que nunca se revisitaron quedan crudos.
 * Usando el cierre del período, el TTM de Apple a 2012 daba 44,16 contra los 6,31
 * del ejercicio: exactamente el 7:1 de 2014.
 */
function ajustePorSplits(splits){
  return presentado => splits.filter(s=>s.fecha>presentado).reduce((a,s)=>a*s.ratio,1);
}

/** Aplica el ajuste a cada dato según cuándo se presentó. */
function ajustarSerie(q, aj){
  return q.map(x => Object.assign({}, x, { val: x.val / aj(x.filed) }));
}

async function splitsDe(sym){
  const u=`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=25y&events=split`;
  const j=await (await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}})).json();
  const ev=j.chart?.result?.[0]?.events?.splits||{};
  return Object.values(ev).map(s=>({fecha:new Date(s.date*1000).toISOString().slice(0,10),
                                    ratio:s.numerator/s.denominator})).sort((a,b)=>a.fecha<b.fecha?-1:1);
}
module.exports={serieEPS,normalizar,ttmDe,validarTTM,ajustePorSplits,splitsDe,dias,UA};
