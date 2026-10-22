'use strict';
const $=id=>document.getElementById(id), fmt=(n,d=0)=>Number(n).toLocaleString('en-AU',{maximumFractionDigits:d}), pct=n=>`${Math.round(n*100)}%`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATEGORIES={A:{color:'#cf633c',label:'Little tree shade'},B:{color:'#d5a342',label:'Insufficient tree shade'},C:{color:'#8072a2',label:'Building-led shade'},D:{color:'#368776',label:'Substantial tree shade'}};

const DISPLAY_TEXT={"\u542b\u62f1\u5eca\u6bb5\uff0c\u591a\u4e3a\u79c1\u6709\u7269\u4e1a\uff0c\u9700\u4e0e\u4e1a\u4e3b\u534f\u5546": "Includes an arcade, often private property; consult the owner", "\u542b\u8fc7\u8857\u6bb5\uff0c\u4f4d\u4e8e\u8f66\u884c\u9053\uff0c\u4e0d\u53ef\u79cd\u690d": "Includes a carriageway crossing; no planting", "\u542b\u6865\u9762\uff0c\u7ba1\u7406\u65b9\u9700\u53e6\u884c\u6838\u5b9e": "Includes a bridge deck; confirm the managing authority", "\u8def\u7ebf\u4e3a\u5df2\u8ba1\u7b97\u7684\u5730\u5757\u8d77\u70b9\u5230\u4e09\u7ad9\u4e2d\u6700\u8fd1\u5165\u53e3\u7684\u8def\u5f84\uff1b\u8ddd\u79bb\u4e0d\u8d85\u8fc7800\u7c73\uff0c\u8fde\u63a5\u7ebf\u63a5\u5165\u8ddd\u79bb\u4e0d\u8ba1\u5165\u3002": "Routes connect property origins to the nearest entrance among the three stations, within 800 m network distance. Access connectors do not count towards this distance.", "\u8303\u56f4\u9762\u4e3a800\u7c73\u53ef\u8fbe\u8def\u6bb5\u5916\u626950\u7c73\u540e\u7684\u663e\u793a\u8fb9\u754c\u3002": "The displayed catchment is a 50 m buffer around links reachable within 800 m.", "\u7d2b\u8272\u4e3a\u5efa\u7b51\u906e\u9634\uff1b\u7eff\u8272\u4e3aB\u7ec4\u76f8\u5bf9\u4e8eA\u7ec4\u65b0\u589e\u7684\u6811\u6728\u906e\u9634\uff0c\u4e0d\u80fd\u8868\u8fbe\u88ab\u5efa\u7b51\u9634\u5f71\u8986\u76d6\u7684\u6811\u6728\u9634\u5f71\u3002": "Purple shows building shade; green shows additional tree shade outside building shadows. Tree shade overlapping building shade is not shown separately.", "\u6811\u51a0\u9ad8\u5ea6\u7edf\u4e00\u5047\u8bbe8\u7c73\uff0c\u6811\u51a0\u900f\u5149\u73873%\uff1b3D\u6a21\u578b\u4e3a\u5c55\u793a\u793a\u610f\uff0c\u672a\u6a21\u62df\u771f\u5b9e\u6811\u5f62\u3002": "Tree height is uniformly assumed to be 8 m, with 3% canopy transmission. The 3D canopy is illustrative and does not represent individual tree shapes.", "\u9634\u5f71\u6765\u81ea\u5df2\u6709UMEP\u8ba1\u7b97\uff0c\u4e0d\u662f\u6c14\u6e29\u3001MRT\u6216\u70ed\u8212\u9002\u6307\u6807\u3002": "Shadows are existing UMEP outputs, not air temperature, MRT or thermal-comfort measurements.", "\u9634\u5f71\u6805\u683c\u6309\u539f\u59cb2\u7c73\u6570\u636e\u91cd\u6295\u5f71\u4f9b\u7f51\u9875\u663e\u793a\uff1b\u6392\u540d\u4fdd\u7559\u65e2\u6709\u5206\u6790\u7ed3\u679c\u3002": "Original 2 m shadow rasters are reprojected for web display. Existing analytical ranks are retained."};
const LEGACY_STATUS={"\u5f85\u73b0\u573a\u6838\u67e5": "To inspect", "\u4fdd\u7559": "Retain", "\u6682\u7f13": "Defer"};
function statusEnglish(s){return LEGACY_STATUS[s]||s}
function managerNote(p){return String(p.manager_note||'').split("\uFF1B").map(s=>DISPLAY_TEXT[s]||s).join("; ")}
function diagnosisLabel(p){return CATEGORIES[p.diagnosis_code]?.label||p.diagnosis}
const EXPOSURE_DENOMINATOR=416812;
const exposureShare=p=>Number(p.priority_score)/EXPOSURE_DENOMINATOR*100;
const unevenRoutes=p=>p.route_count_max>0&&p.route_count_range/p.route_count_max>0.5;
const MODE_LABELS={diagnosis:'Diagnosis',priority:'Priority',shade:'Shade now'};
let routeCollections={},blockUtci={},originDetails={},shadowChoice={building:true,tree:true};
const EMPTY={type:'FeatureCollection',features:[]};
let map,manifest,blocks,origins,routeEdges,entrances,selected=null,station='all',mode='diagnosis',frame=6,timer=null,plan={};
try{plan=JSON.parse(localStorage.getItem('melbourne-shade-plan-v1')||'{}')}catch{plan={}}
let visibleBlocks=[], visibleOrigins=[],markers=[],toastTimer,shadowRevision=0;
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4500)}
function bbox(features){let xs=[],ys=[];function visit(x){if(typeof x[0]==='number'){xs.push(x[0]);ys.push(x[1])}else x.forEach(visit)}features.forEach(f=>visit(f.geometry.coordinates));return [[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)]]}
function fit(features,extra={}){if(features.length)map.fitBounds(bbox(features),{padding:{top:95,bottom:150,left:50,right:50},maxZoom:17,duration:1100,...extra})}
function fc(features){return {type:'FeatureCollection',features}}
function stationName(id){return manifest.stations[id]||id}
function stationMatches(p){return station==='all'||(Array.isArray(p.stations)&&p.stations.includes(station))}
function colorExpression(){if(mode==='diagnosis')return ['match',['get','diagnosis_code'],...Object.entries(CATEGORIES).flatMap(([code,c])=>[code,c.color]),'#9ba7a1'];return mode==='priority'?['interpolate',['linear'],['get','priority_score'],0,'#b1c9c1',500,'#e2b56a',1800,'#cd5f35',6000,'#8e2926']:['interpolate',['linear'],['at',frame,['get','shade_frames']],0,'#e99753',.35,'#e7cc8b',.65,'#73ac98',1,'#246752']}
function setVisible(id,on){map.setLayoutProperty(id,'visibility',on?'visible':'none')}
function updateFilters(){
  const d=$('diagnosis').value,q=$('search').value.trim().toUpperCase();
  visibleBlocks=blocks.features.filter(f=>stationMatches(f.properties)&&(d==='all'||f.properties.diagnosis_code===d)&&(!q||[f.properties.block_id,f.properties.street_name,f.properties.extent].some(v=>String(v||'').toUpperCase().includes(q)))).sort((a,b)=>a.properties.rank-b.properties.rank);
  visibleOrigins=origins.features.filter(f=>station==='all'||f.properties.station===station);
  map.getSource('all-routes').setData(routeCollections[station]);
  $('mapHint').textContent=`${station==='all'?'Three stations':stationName(station)} · ${fmt(visibleOrigins.length)} property routes available · Select a street for evidence`;
  map.getSource('blocks').setData(fc(visibleBlocks));map.getSource('origins').setData(fc(visibleOrigins));
  $('blockCount').textContent=fmt(visibleBlocks.length);$('originCount').textContent=fmt(visibleOrigins.length);
  const activeOrigin=$('originSelect').value;
  $('originSelect').innerHTML='<option value="">Choose a property origin…</option>'+visibleOrigins.map(f=>`<option value="${esc(f.properties.origin_id)}">Property ${esc(f.properties.origin_id)} · ${fmt(f.properties.distance_m)} m · ${esc(stationName(f.properties.station))}</option>`).join('');
  if(visibleOrigins.some(f=>f.properties.origin_id===activeOrigin))$('originSelect').value=activeOrigin;
  $('listCount').textContent=`Showing ${fmt(visibleBlocks.length)} / Total ${fmt(blocks.features.filter(f=>stationMatches(f.properties)).length)}`;
  $('ranking').innerHTML=visibleBlocks.map(f=>{const p=f.properties;return `<button class="rank-item ${selected===p.block_id?'active':''}" data-block="${p.block_id}"><span class="rank-number">${String(p.rank).padStart(2,'0')}</span><span class="rank-info"><i class="category-dot" style="background:${CATEGORIES[p.diagnosis_code].color}"></i><span class="rank-street">${esc(p.street_name||'Unnamed street segment')}</span><small><span class="list-block-id">${p.block_id}</span> · ${esc(diagnosisLabel(p))} · ${fmt(p.length_m)} m</small></span><span class="rank-value" title="Share of network unshaded exposure">${exposureShare(p)>=.1?exposureShare(p).toFixed(2)+'%':''}</span></button>`}).join('')||'<p class="minor">No streets match these filters.</p>';
  $('ranking').querySelectorAll('[data-block]').forEach(b=>b.onclick=()=>selectBlock(b.dataset.block,true));
  $('viewLabel').textContent=`${MODE_LABELS[mode]} / ${station==='all'?'All three stations':stationName(station)}`;
  markers.forEach(m=>m.marker.getElement().style.opacity=station==='all'||m.id===station?'1':'.4');
}
function selectStation(id){station=id;selected=null;document.querySelectorAll('[data-station]').forEach(b=>b.classList.toggle('active',b.dataset.station===id));updateFilters();clearRoute();map.getSource('selection').setData(EMPTY);$('detailContent').innerHTML=`<div class="empty-mark">↖</div><h2>${id==='all'?'Three-station walking precincts':esc(stationName(id))}</h2><p>Showing ${fmt(visibleBlocks.length)} streets, ${fmt(visibleOrigins.length)} reachable properties.</p><div class="help-card"><strong>Explore a commute route</strong><p>Enable property origins and select a blue point, or choose a property in the sidebar to see its shortest walking route.</p></div><div class="help-card"><strong>From model evidence to site checks</strong><p>Select a street to review the evidence and add it to your worklist.</p></div>`;fit(visibleBlocks.length?visibleBlocks:blocks.features)}
function setMode(value){
 mode=value;for(const key of Object.keys(MODE_LABELS))$(key+'Mode').classList.toggle('active',value===key);
 map.setPaintProperty('block-lines','line-color',colorExpression());
 $('legendTitle').textContent=value==='shade'?'Shade at selected time':MODE_LABELS[value];
 $('categoryLegend').classList.toggle('hidden',value!=='diagnosis');
 $('legendGradient').classList.toggle('hidden',value==='diagnosis');
 $('legendLow').parentElement.classList.toggle('hidden',value==='diagnosis');
 $('legendLow').textContent=value==='priority'?'Low':'0%';$('legendHigh').textContent=value==='priority'?'High':'100%';
 $('legendGradient').style.background=value==='priority'?'linear-gradient(90deg,#b1c9c1,#e2b56a,#cd5f35,#8e2926)':'linear-gradient(90deg,#e99753,#e7cc8b,#73ac98,#246752)';updateFilters();
}
function buildRouteCollections(){
 for(const id of ['all',...Object.keys(manifest.stations)]){
  const members=origins.features.filter(f=>id==='all'||f.properties.station===id);
  const ids=new Set(members.flatMap(f=>f.properties.edge_ids));
  routeCollections[id]=fc([...ids].map(edge=>({type:'Feature',properties:{edge_id:edge},geometry:routeEdges[String(edge)]})));
 }
}
function shadeBreakdown(p){
 const values=[p.shade_buildings,p.tree_contribution,1-p.shade_total].map(v=>Math.max(0,Math.min(1,v)));
 const floors=values.map(v=>Math.floor(v*100));const order=values.map((v,i)=>[v*100-floors[i],i]).sort((a,b)=>b[0]-a[0]);
 const remainder=100-floors.reduce((a,b)=>a+b,0);for(let i=0;i<remainder;i++)floors[order[i%3][1]]++;
 const labels=['Building shade','Additional tree shade','Unshaded'],classes=['building','tree','sunlit'];
 return `<section class="shade-breakdown" aria-label="Three-hour average shade breakdown"><div class="breakdown-title">Three-hour average · Sources of shade</div><div class="stacked-bar" role="img" aria-label="${labels.map((s,i)=>s+' '+floors[i]+'%').join(', ')}">${values.map((v,i)=>`<span class="${classes[i]}" style="width:${v*100}%" title="${labels[i]} ${(v*100).toFixed(1)}%"></span>`).join('')}</div><div class="breakdown-readings">${labels.map((s,i)=>`<div class="reading-${classes[i]}"><strong>${floors[i]}%</strong><span>${s}</span></div>`).join('')}</div><p class="breakdown-total">Total three-hour average shade ${pct(p.shade_total)}</p></section>`;
}
function priorityState(p){
 if(p.route_count===0)return {code:'A',value:'No modelled routes',label:'',note:'No modelled property route passes through this street'};
 if(p.unshaded_length_m===0)return {code:'B',value:'Fully shaded',label:'',note:p.diagnosis_code==='C'?'No shade deficit in this window · Shade depends on nearby buildings':'No shade deficit in this time window'};
 const share=exposureShare(p);
 if(share>=.1)return {code:'C',value:share.toFixed(2)+'%',label:'Share of unshaded exposure across the three-station walking network',note:''};
 return {code:'D',value:share===0?'0.00%':'<0.1%',label:'Share of unshaded exposure across the three-station walking network',note:share===0?'0.00% of network unshaded exposure (raw score: 0)':'Less than 0.1% of network unshaded exposure'};
}
function priorityHero(p){const s=priorityState(p);return `<section class="priority-hero" aria-label="Street improvement evidence"><strong class="${s.code==='A'||s.code==='B'?'hero-text':''}">${s.value}</strong>${s.label?`<div>${s.label}</div>`:''}${s.note?`<p>${s.note}</p>`:''}<div class="rank-position">Rank <strong>#${p.rank}</strong> / 1,399</div></section>`}
function planTotals(entries){
 let length=0,score=0;const counts={A:0,B:0,C:0,D:0};
 for(const [id] of entries){const p=blocks.features.find(f=>f.properties.block_id===id).properties;length+=p.length_m;score+=p.priority_score;counts[p.diagnosis_code]++}
 return {length,share:score/EXPOSURE_DENOMINATOR*100,counts};
}

function heatStress(t){return t>=46?'Extreme heat stress':t>=38?'Very strong heat stress':t>=32?'Strong heat stress':t>=26?'Moderate heat stress':'No heat stress'}
function utciReadings(p){
 const pair=blockUtci[p.block_id]?.[manifest.times[frame]]||[null,null];
 const rows=pair.map((t,i)=>t===null?'':`<div class="utci-reading"><div>${i===0?'Sun-exposed':'Shaded'} ≈ <b class="utci-temperature">${Number(t).toFixed(1)}°C</b></div><small class="utci-level">${heatStress(t)}</small></div>`).filter(Boolean);
 return rows.join('')||'<div class="minor">No valid samples at this time</div>';
}
function syncGroundLayers(){
 const on=$('utciLayer').checked;setVisible('utci-ground',on);setVisible('building-shadows',!on&&$('buildingShadow').checked);setVisible('tree-shadows',!on&&$('treeShadow').checked);
 map.setPaintProperty('block-lines','line-opacity',on?.5:.94);map.setPaintProperty('block-halo','line-opacity',on?.18:.55);map.setPaintProperty('all-route-lines','line-opacity',on?.2:.65);
 $('streetLegend').classList.toggle('hidden',on);$('utciLegend').classList.toggle('hidden',!on);$('shadowLegend').classList.toggle('hidden',on);$('shadowHeatNote').classList.toggle('hidden',on);$('mapLegend').classList.toggle('thermal',on);
 $('timeContext').textContent=on?'Evening UTCI':'Evening shade';$('timeGroundNote').textContent=on?'UTCI · Reference only':'Building + tree shade';$('utciTime').textContent=$('timeLabel').textContent;
}

async function setFrame(index){
  frame=Number(index);$('time').value=frame;const t=manifest.times[frame];$('timeLabel').textContent=`${t.slice(0,2)}:${t.slice(2)}`;
  if(mode==='shade')map.setPaintProperty('block-lines','line-color',colorExpression());
  const revision=++shadowRevision;
  const urls=[...['building','tree'].map(k=>`data/shadows/${k}_${t}.png`),`data/utci/utci_${t}.png`];$('utciTime').textContent=$('timeLabel').textContent;
  try{await Promise.all(urls.map(url=>new Promise((resolve,reject)=>{const im=new Image();im.onload=resolve;im.onerror=reject;im.src=url})));if(revision!==shadowRevision)return;map.getSource('building-shadow').updateImage({url:urls[0]});map.getSource('tree-shadow').updateImage({url:urls[1]});map.getSource('utci-image').updateImage({url:urls[2]})}catch{toast('Ground-layer images could not load for this time. Check the local data.')}
  if(selected&&$('frameShade')){const p=blocks.features.find(f=>f.properties.block_id===selected).properties;$('frameShade').textContent=pct(p.shade_frames[frame]);if($('frameUtci'))$('frameUtci').innerHTML=utciReadings(p);if($('utciCaption'))$('utciCaption').textContent=`Feels-like temperature (${t.slice(0,2)}:${t.slice(2)})`;$('chartCursor')?.setAttribute('x1',12+frame*18);$('chartCursor')?.setAttribute('x2',12+frame*18)}
}
function chart(p){const line=arr=>arr.map((v,i)=>`${12+i*18},${82-v*68}`).join(' ');return `<svg class="chart" viewBox="0 0 240 94" aria-label="Shade changes from 16:00 to 19:00"><line x1="12" y1="14" x2="228" y2="14" stroke="#e7ece5"/><line x1="12" y1="48" x2="228" y2="48" stroke="#e7ece5"/><line x1="12" y1="82" x2="228" y2="82" stroke="#e7ece5"/><polyline points="${line(p.shade_frames)}" fill="none" stroke="#248365" stroke-width="2.5"/><polyline points="${line(p.building_frames)}" fill="none" stroke="#76629a" stroke-width="1.7"/><line id="chartCursor" x1="${12+frame*18}" x2="${12+frame*18}" y1="8" y2="85" stroke="#b88942" stroke-dasharray="3 3"/></svg><div class="chart-label"><span>16:00</span><span>17:30</span><span>19:00</span></div><div class="chart-key">Green: total shade · Purple: building shade</div>`}
function metric(value,label,suffix=''){return `<div class="metric"><strong>${value}<small>${suffix}</small></strong><span>${label}</span></div>`}
function selectBlock(id,fly=false){const f=blocks.features.find(f=>f.properties.block_id===id);if(!f)return;selected=id;clearRoute();map.getSource('selection').setData(fc([f]));const p=f.properties,r=plan[id]||{};
 $('detail').classList.add('open');$('detailContent').innerHTML=`<div class="street-header"><h2>${esc(p.street_name||`${(p.stations||[]).map(stationName).join(' / ')||'Study station'} precinct · Unnamed street segment`)}</h2><div class="block-subtitle">${id}</div>${p.extent?`<div class="street-extent">${esc(p.extent)}</div>`:''}<div class="block-badges"><span class="badge">${esc(diagnosisLabel(p))} · ${p.diagnosis_code}</span><span class="badge ownership">Managed by: ${esc(p.manager||'City of Melbourne')}</span>${p.is_bridge?'<span class="badge bridge-badge">Bridge deck · No planting</span>':''}</div>${p.manager_note?`<div class="manager-note">${esc(managerNote(p))}</div>`:''}<div class="street-location">${(p.stations||[]).map(stationName).map(esc).join(' / ')} · ${fmt(p.length_m,1)} m</div></div>${priorityHero(p)}${shadeBreakdown(p)}<div class="metrics">${metric(`<span id="frameShade">${pct(p.shade_frames[frame])}</span>`,'Shade at this time')}<div class="utci-metric"><span class="utci-caption" id="utciCaption">Feels-like temperature (${manifest.times[frame].slice(0,2)}:${manifest.times[frame].slice(2)})</span><div id="frameUtci">${utciReadings(p)}</div></div><div class="metric route-count-metric"><strong><small>Approx.</small> ${fmt(Math.round(p.route_count))}<small> routes</small></strong><span>Modelled routes</span></div><div>${metric(fmt(p.unshaded_length_m,1),'Sun-exposed length',' m')}<div class="sunlit-context">Shade below 50% · Sun-exposed UTCI ≥ 46°C (extreme heat stress) during 16:00–18:30</div></div>${metric(fmt(p.longest_unshaded_m,1),'Longest unshaded stretch',' m')}</div>${chart(p)}${unevenRoutes(p)?'<p class="review-alert">Modelled demand varies along this street. Priority may be concentrated at one end; check on site whether only part of the street needs improvement.</p>':''}<hr><strong>Add to improvement worklist</strong><label for="reviewStatus">Review status</label><select id="reviewStatus"><option>To inspect</option><option>Retain</option><option>Defer</option></select><label for="reviewNote">Site checks / Planning notes</label><textarea id="reviewNote" maxlength="2000" placeholder="For example: check footpath clearance, underground utilities and space for tree pits…">${esc(r.note||'')}</textarea><button class="primary" id="saveReview">Save to worklist</button><p class="minor">Route count is the length-weighted mean of modelled property routes, not measured pedestrian volumes.${p.is_bridge?'This bridge-deck street is excluded from tree-planting proposals.':''}</p>`;
 $('detail').scrollTop=0;$('reviewStatus').value=r.status||'To inspect';$('saveReview').onclick=()=>{plan[id]={status:$('reviewStatus').value,note:$('reviewNote').value,updated_at:new Date().toISOString()};savePlan();toast(`${id} saved to worklist`)};updateFilters();if(fly)fit([f],{maxZoom:17.3});
}
function clearRoute(){map.getSource('route').setData(EMPTY);map.getSource('active-origin').setData(EMPTY)}
function selectOrigin(f){
 const p=f.properties,d=originDetails[p.origin_id],coords=[];
 if(!d){toast('Route details are unavailable for this property.');return}
 for(const id of p.edge_ids){const g=routeEdges[String(id)];if(!g)continue;if(g.type==='LineString')coords.push(g.coordinates);else coords.push(...g.coordinates)}
 const line={type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:coords}};
 map.getSource('route').setData(fc([line]));map.getSource('active-origin').setData(fc([f]));map.getSource('selection').setData(EMPTY);selected=null;$('detail').classList.add('open');
 const title=d.street_name?`Property near ${d.street_name}`:`Property near ${stationName(p.station)} station`;
 const entrance=d.entrance_number!==null?`Entrance ${d.entrance_number}`:'Accessible entrance';
 const rows=d.priority_streets.map(b=>`<button class="route-priority-row" data-route-block="${b.block_id}"><strong>#${b.rank}</strong><span>${esc(b.street_name||'Unnamed street segment')}</span><small>${fmt(b.length_m,1)} m</small></button>`).join('');
 $('detailContent').innerHTML=`<div class="street-header"><h2>${esc(title)}</h2><div class="block-subtitle">Property ID ${esc(p.origin_id)}</div><div class="block-badges"><span class="badge">${esc(stationName(p.station))}</span></div></div><div class="metrics route-metrics">${metric(fmt(d.walking_distance_m,1),'Walking distance',' m')}<div>${metric(fmt(d.unshaded_length_m,1),'Sun-exposed length',' m')}<div class="minor route-shade-note">Shade below 50% · Three-hour average</div></div></div>${d.longest_unshaded_m===null?'':`<p class="route-longest">Longest continuous sun exposure <strong>${fmt(d.longest_unshaded_m,1)} m</strong></p>`}<div class="route-destination"><span>Destination</span><strong>${esc(stationName(p.station))} station · ${esc(entrance)}</strong><small>${esc(d.entrance_location)}</small></div><section class="route-priority"><h3>Priority streets on this route</h3><p class="route-top20">Passes through <strong>${d.top20_count}</strong> of the top 20 streets.</p>${rows||'<p class="minor">This route does not pass through any top 100 streets.</p>'}</section><button id="routeOverview" class="primary">View full route</button><p class="minor route-disclaimer">The route minimises walking distance; it is not necessarily the shadiest way.</p>`;
 $('detail').scrollTop=0;
 $('detailContent').querySelectorAll('[data-route-block]').forEach(b=>b.onclick=()=>selectBlock(b.dataset.routeBlock,true));
 $('routeOverview').onclick=()=>fit(coords.length?[line,f]:[f],{maxZoom:16.8});fit(coords.length?[line,f]:[f],{maxZoom:16.8});
}
function savePlan(){try{localStorage.setItem('melbourne-shade-plan-v1',JSON.stringify(plan))}catch{toast('This browser cannot save review records. Export a JSON backup now.')}$('planCount').textContent=Object.keys(plan).length;renderPlan()}
function renderPlan(){const rows=Object.entries(plan).sort((a,b)=>blocks.features.find(f=>f.properties.block_id===a[0]).properties.rank-blocks.features.find(f=>f.properties.block_id===b[0]).properties.rank);const totals=planTotals(rows);$('planSummary').hidden=rows.length===0;$('planSummary').innerHTML=rows.length?`<strong>Selected ${rows.length} streets · Total ${fmt(totals.length,1)} m · Share of network unshaded exposure ${totals.share.toFixed(2)}%</strong><div>${Object.entries(totals.counts).filter(([,n])=>n>0).map(([c,n])=>`${c} category: ${n} streets`).join(' · ')}</div>`:'';$('planRows').innerHTML=rows.map(([id,r])=>`<div class="plan-row"><div><strong>${id} · ${esc(r.status)}</strong><p>${esc(r.note)||'No notes yet'}</p></div><button data-open="${id}">Locate</button><button data-remove="${id}" aria-label="Remove from worklist: ${id}">Remove</button></div>`).join('')||'<p>Your worklist is empty. Select a street and record a review status.</p>';$('planRows').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{$('plan').close();selectBlock(b.dataset.open,true)});$('planRows').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{delete plan[b.dataset.remove];savePlan()})}
function download(text,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
let pendingImport=null,importBackup=null,importRevision=0;
function closeImportPreview(){pendingImport=null;$('importPreview').close()}
function renderImportPreview(){
 if(!pendingImport)return;
 try{
  const result=ShadeWorklistImport.prepare(pendingImport.data,blocks.features,plan,{replaceBlank:$('replaceBlankNotes').checked,statusEnglish});
  pendingImport.result=result;
  $('importPreviewSummary').textContent=`${result.added} added · ${result.updated} updated · ${result.unchanged} unchanged${result.keptNotes?` · ${result.keptNotes} blank notes preserved`:''}`;
  $('importPreviewWarning').textContent=result.legacy?'This older Excel export has no scenario metadata. Verify that it belongs to the current study before applying.':'Scenario and available model-version metadata checked.';
  $('importPreviewRows').innerHTML=result.changes.length?result.changes.map(c=>`<tr><td><strong>${esc(c.street_name)}</strong><small>${esc(c.block_id)}</small></td><td>${esc(c.old?.status||'Not in worklist')} → <strong>${esc(c.status)}</strong></td><td><div class="previous-note">Before: ${esc(c.old?.note||'(blank)')}</div><div>After: ${esc(c.note||'(blank)')}</div></td></tr>`).join(''):'<tr><td colspan="3">No review changes to apply.</td></tr>';
  $('applyWorklistImport').disabled=!result.changes.length;
 }catch(err){pendingImport.result=null;$('applyWorklistImport').disabled=true;$('importPreviewSummary').textContent=err.message;$('importPreviewRows').innerHTML=''}
}
async function previewWorklistFile(file){
 const revision=++importRevision;if(file.size>8000000)throw new Error('The worklist file exceeds 8 MB');
 let data;
 if(/\.xlsx$/i.test(file.name))data=await ShadeWorklistImport.readXlsx(await file.arrayBuffer());
 else if(/\.json$/i.test(file.name))data=JSON.parse(await file.text());
 else throw new Error('Choose a .xlsx or .json worklist exported by this dashboard');
 if(revision!==importRevision)return;
 ShadeWorklistImport.prepare(data,blocks.features,plan,{statusEnglish});
 pendingImport={data,fileName:file.name,result:null};$('replaceBlankNotes').checked=false;$('importPreviewFile').textContent=file.name;renderImportPreview();$('importPreview').showModal();
}
function applyWorklistImport(){
 if(!pendingImport?.result)return;
 // Revalidate at commit time and assign only the two editable review fields.
 const result=ShadeWorklistImport.prepare(pendingImport.data,blocks.features,plan,{replaceBlank:$('replaceBlankNotes').checked,statusEnglish});
 if(!result.changes.length)return;
 importBackup={before:JSON.parse(JSON.stringify(plan)),applied:{}};const now=new Date().toISOString();
 for(const c of result.changes){const record={status:c.status,note:c.note,updated_at:now};plan[c.block_id]=record;importBackup.applied[c.block_id]={...record}};
 savePlan();$('undoWorklistImport').disabled=false;closeImportPreview();if(selected)selectBlock(selected);
 $('importMessage').textContent=`Imported ${result.changes.length} review changes. Other worklist entries and all model rankings are unchanged.`;
 toast(`Imported ${result.changes.length} review changes. Model rankings unchanged.`);
}
function undoWorklistImport(){
 if(!importBackup)return;let restored=0,kept=0;
 for(const [id,applied] of Object.entries(importBackup.applied)){if(JSON.stringify(plan[id])!==JSON.stringify(applied)){kept++;continue}if(importBackup.before[id])plan[id]=importBackup.before[id];else delete plan[id];restored++}
 importBackup=null;savePlan();$('undoWorklistImport').disabled=true;if(selected)selectBlock(selected);$('importMessage').textContent=`Undid ${restored} imported records${kept?`; kept ${kept} later edits`:''}. Other records and model rankings are unchanged.`;toast('Last import undone. Model rankings unchanged.');
}

function bind(){document.querySelectorAll('[data-station]').forEach(b=>b.onclick=()=>selectStation(b.dataset.station));$('diagnosis').onchange=updateFilters;$('search').oninput=updateFilters;$('diagnosisMode').onclick=()=>setMode('diagnosis');$('priorityMode').onclick=()=>setMode('priority');$('shadeMode').onclick=()=>setMode('shade');$('time').oninput=e=>setFrame(e.target.value);
 $('originSelect').onchange=e=>{const f=origins.features.find(f=>f.properties.origin_id===e.target.value);if(f)selectOrigin(f)};
 $('play').onclick=()=>{if(timer){clearInterval(timer);timer=null;$('play').textContent='▶';$('play').setAttribute('aria-label','Play shade animation')}else{timer=setInterval(()=>setFrame((frame+1)%13),1200);$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Pause shade animation')}};
 for(const [control,layer] of Object.entries({allRoutes:'all-route-lines',buildings:'buildings-3d',trees:'trees-3d',origins:'origin-points',boundary:'catchment-line'}))$(control).onchange=()=>setVisible(layer,$(control).checked);
 $('utciLayer').onchange=()=>{if($('utciLayer').checked){shadowChoice={building:$('buildingShadow').checked,tree:$('treeShadow').checked};$('buildingShadow').checked=false;$('treeShadow').checked=false}else{$('buildingShadow').checked=shadowChoice.building;$('treeShadow').checked=shadowChoice.tree}syncGroundLayers()};
 for(const id of ['buildingShadow','treeShadow'])$(id).onchange=()=>{if($(id).checked)$('utciLayer').checked=false;syncGroundLayers()};
 $('home').onclick=()=>fit(station==='all'?blocks.features:visibleBlocks,{pitch:map.getPitch()});$('view3d').onclick=()=>{const is3d=map.getPitch()>10;map.easeTo({pitch:is3d?0:48,bearing:is3d?0:-18,duration:850});$('view3d').textContent=is3d?'3D view':'2D view'};
 $('closeDetail').onclick=()=>{$('detail').classList.remove('open');selected=null;clearRoute();map.getSource('selection').setData(EMPTY);$('detailContent').innerHTML='<div class="empty-mark">↖</div><h2>Explore another street</h2><p>Select a street, or enable and select a property origin, to explore model results and shortest routes.</p>'};
 $('aboutBtn').onclick=()=>$('about').showModal();$('planBtn').onclick=()=>{renderPlan();$('plan').showModal()};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
 $('exportJson').onclick=()=>download(JSON.stringify({schema:'melbourne-shade-plan-v1',scenario:'2026-01-27_1600-1900',model_version:ShadeWorklistImport.modelVersion(blocks.features),exported_at:new Date().toISOString(),records:Object.entries(plan).map(([block_id,r])=>({block_id,...r}))},null,2),'shade-review-list.json','application/json');
 $('exportXlsx').onclick=()=>{
  if(!Object.keys(plan).length){toast('Your worklist is empty. Add a street before exporting.');return}
  try{
   const byId=new Map(blocks.features.map(f=>[f.properties.block_id,f.properties]));
   const records=Object.entries(plan).map(([id,r])=>{const p=byId.get(id);return {...p,...r,block_id:id,status:statusEnglish(r.status),diagnosis:diagnosisLabel(p),manager_note:managerNote(p),exposure_share:exposureShare(p)}}).sort((a,b)=>a.rank-b.rank);
   download(ShadeReviewXlsx.build(records,{model_version:ShadeWorklistImport.modelVersion(blocks.features)}),'shade-review-list.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
   toast('Excel exported. Only status and note are editable. Use Import worklist to load the edited Excel file.');
  }catch(err){toast('Excel export failed: '+err.message)}
 };
 $('exportWorklist').onclick=()=>{const open=$('exportMenu').hidden;$('exportMenu').hidden=!open;$('exportWorklist').setAttribute('aria-expanded',String(open))};
 for(const id of ['exportJson','exportXlsx']){const action=$(id).onclick;$(id).onclick=()=>{$('exportMenu').hidden=true;$('exportWorklist').setAttribute('aria-expanded','false');action()}};
 document.addEventListener('click',e=>{if(!e.target.closest('.export-picker')){$('exportMenu').hidden=true;$('exportWorklist').setAttribute('aria-expanded','false')}});
 $('importPlan').onchange=async e=>{const file=e.target.files[0];if(!file)return;$('importMessage').textContent='Reading worklist…';try{await previewWorklistFile(file);$('importMessage').textContent='Review the preview before applying changes.'}catch(err){$('importMessage').textContent='Import failed: '+err.message;toast('Import failed. '+err.message)}finally{e.target.value=''}};
 $('replaceBlankNotes').onchange=renderImportPreview;
 $('cancelWorklistImport').onclick=closeImportPreview;
 $('importPreview').addEventListener('cancel',()=>{pendingImport=null});
 $('applyWorklistImport').onclick=()=>{try{applyWorklistImport()}catch(err){$('importPreviewSummary').textContent=err.message}};
 $('undoWorklistImport').onclick=undoWorklistImport;
}
async function init(){try{
 const names=['manifest','blocks','origins','route_edges','entrances','buildings','canopy','catchment','block_utci','origin_details'];const all=await Promise.all(names.map(async n=>{const r=await fetch(`data/${n}.json`);if(!r.ok)throw new Error(`Missing data: ${n}`);return r.json()}));[manifest,blocks,origins,routeEdges,entrances]=all;const [buildings,canopy,catchment]=all.slice(5);blockUtci=all[8];originDetails=all[9];
 const validIds=new Set(blocks.features.map(f=>f.properties.block_id));plan=Object.fromEntries(Object.entries(plan&&typeof plan==='object'?plan:{}).map(([id,r])=>[id,r&&{...r,status:statusEnglish(r.status)}]).filter(([id,r])=>validIds.has(id)&&r&&typeof r.note==='string'&&['To inspect','Retain','Defer'].includes(r.status)));
 $('methodNotes').innerHTML=manifest.notes.map(s=>`<li>${esc(DISPLAY_TEXT[s]||s)}</li>`).join('');
 map=new maplibregl.Map({container:'map',center:[144.949,-37.814],zoom:13.8,pitch:48,bearing:-18,antialias:true,maxPitch:65,style:{version:8,sources:{basemap:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}},layers:[{id:'background',type:'background',paint:{'background-color':'#f2f3f3'}},{id:'basemap',type:'raster',source:'basemap',paint:{'raster-saturation':-1,'raster-opacity':.38,'raster-contrast':-.25}}]}});
 map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-right');map.addControl(new maplibregl.ScaleControl({maxWidth:100}),'bottom-left');let warned=false;map.on('error',e=>{console.warn(e.error);if(!warned&&String(e.error?.message).match(/tile|fetch|network/i)){warned=true;toast('Basemap tiles are temporarily unavailable. Local analysis layers remain usable.')}});
 map.on('load',()=>{
  for(const [id,data] of Object.entries({blocks,origins,entrances,buildings,canopy,catchment,selection:EMPTY,route:EMPTY,'all-routes':EMPTY,'active-origin':EMPTY}))map.addSource(id,{type:'geojson',data});
  for(const group of ['building','tree']){map.addSource(`${group}-shadow`,{type:'image',url:`data/shadows/${group}_${manifest.times[frame]}.png`,coordinates:manifest.shadowCorners});map.addLayer({id:`${group}-shadows`,type:'raster',source:`${group}-shadow`,paint:{'raster-opacity':.8,'raster-fade-duration':0,'raster-resampling':'nearest'}})}
  map.addSource('utci-image',{type:'image',url:`data/utci/utci_${manifest.times[frame]}.png`,coordinates:manifest.shadowCorners});map.addLayer({id:'utci-ground',type:'raster',source:'utci-image',layout:{visibility:'none'},paint:{'raster-opacity':.9,'raster-fade-duration':0,'raster-resampling':'nearest'}});
  map.addLayer({id:'catchment-line',type:'line',source:'catchment',paint:{'line-color':'#487d68','line-width':1.4,'line-dasharray':[4,3],'line-opacity':.8}});
  map.addLayer({id:'buildings-3d',type:'fill-extrusion',source:'buildings',paint:{'fill-extrusion-color':'#d9dddf','fill-extrusion-height':['get','height'],'fill-extrusion-base':['get','base'],'fill-extrusion-opacity':.84,'fill-extrusion-vertical-gradient':true}});
  map.addLayer({id:'trees-3d',type:'fill-extrusion',source:'canopy',layout:{visibility:'none'},paint:{'fill-extrusion-color':'#5e9a73','fill-extrusion-height':8,'fill-extrusion-base':2,'fill-extrusion-opacity':.65}});
  map.addLayer({id:'all-route-lines',type:'line',source:'all-routes',paint:{'line-color':'#5e8ba7','line-width':['interpolate',['linear'],['zoom'],12,4,17,10],'line-opacity':.65},layout:{visibility:'none','line-cap':'round','line-join':'round'}});
  map.addLayer({id:'block-halo',type:'line',source:'blocks',paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],12,2,17,7],'line-opacity':.55}});
  map.addLayer({id:'block-lines',type:'line',source:'blocks',paint:{'line-color':colorExpression(),'line-width':['interpolate',['linear'],['zoom'],12,1.8,17,4.5],'line-opacity':.94},layout:{'line-cap':'round','line-join':'round'}});
  map.addLayer({id:'origin-points',type:'circle',source:'origins',layout:{visibility:'none'},paint:{'circle-color':'#40889c','circle-radius':['interpolate',['linear'],['zoom'],12,1.2,16,2.8,18,4],'circle-opacity':.68,'circle-stroke-width':.5,'circle-stroke-color':'#fff'}});
  map.addLayer({id:'entrance-points',type:'circle',source:'entrances',paint:{'circle-color':'#173b33','circle-radius':4,'circle-stroke-width':1.7,'circle-stroke-color':'#fff'}});
  map.addLayer({id:'selection-halo',type:'line',source:'selection',paint:{'line-color':'#fff','line-width':10}});map.addLayer({id:'selection-lines',type:'line',source:'selection',paint:{'line-color':'#173b33','line-width':5}});
  map.addLayer({id:'route-halo',type:'line',source:'route',paint:{'line-color':'#fff','line-width':8}});map.addLayer({id:'route-line',type:'line',source:'route',paint:{'line-color':'#007eac','line-width':4.5},layout:{'line-cap':'round','line-join':'round'}});
  map.addLayer({id:'active-origin',type:'circle',source:'active-origin',paint:{'circle-color':'#007eac','circle-radius':7,'circle-stroke-color':'#fff','circle-stroke-width':3}});
  for(const [id,name] of Object.entries(manifest.stations)){const pts=entrances.features.filter(f=>f.properties.parent_station===id),center=[0,0];pts.forEach(f=>{center[0]+=f.geometry.coordinates[0]/pts.length;center[1]+=f.geometry.coordinates[1]/pts.length});const el=document.createElement('button');el.className='station-marker';el.innerHTML=`<span>▣</span>${esc(name)}`;el.setAttribute('aria-label',`Filter ${name}`);el.onclick=()=>selectStation(id);const marker=new maplibregl.Marker({element:el,anchor:'bottom',offset:[0,-12]}).setLngLat(center).addTo(map);markers.push({id,marker})}
  map.on('click',ev=>{const hits=map.queryRenderedFeatures([[ev.point.x-4,ev.point.y-4],[ev.point.x+4,ev.point.y+4]],{layers:['origin-points','block-lines']});const origin=hits.find(f=>f.layer.id==='origin-points');if(origin){const f=origins.features.find(f=>f.properties.origin_id===origin.properties.origin_id);selectOrigin(f)}else if(hits.length)selectBlock(hits[0].properties.block_id)});
  for(const layer of ['block-lines','origin-points']){map.on('mouseenter',layer,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',layer,()=>map.getCanvas().style.cursor='')}
  buildRouteCollections();
  const keys=Object.entries(CATEGORIES).map(([code,c])=>`<span><i style="background:${c.color}"></i>${code} · ${c.label}</span>`).join('');$('diagnosisKey').innerHTML=keys;$('categoryLegend').innerHTML=keys;
  bind();setVisible('all-route-lines',$('allRoutes').checked);setVisible('origin-points',$('origins').checked);setMode('diagnosis');syncGroundLayers();savePlan();fit(blocks.features,{duration:0});$('loading').classList.add('hidden');for(const t of manifest.times)for(const k of ['building','tree']){const image=new Image();image.src=`data/shadows/${k}_${t}.png`}
 });
 }catch(err){console.error(err);$('loading').innerHTML=`<strong>Map could not load</strong><span>${esc(err.message)}</span><span>Run the local dashboard launcher instead of opening the HTML file directly.</span>`}}
init();

