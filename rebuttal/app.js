(() => {
  'use strict';
  const data = window.CHRONOS_RESULTS;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const element = (tag, attrs, text='') => `<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${esc(v)}"`).join(' ')}>${esc(text)}</${tag}>`;
  const colors = {ink:'#292725',muted:'#6a625b',line:'#e7e1da',accent:'#ad5736',blue:'#497eaa',bar:'#b9c5cc',wash:'#f7ede5'};
  let taskIndex = 0;
  let printing = false;
  const rollouts = window.CHRONOS_ROLLOUTS;
  const selectedMethods = {};
  const selectedConditions = {};
  const defaultConditions = Object.fromEntries(data.tasks.map(task => {
    const policy = task.methods.find(method => method.name === 'Chronos Policy');
    const baselines = task.methods.filter(method => method !== policy);
    const margins = data.conditions.map((_, index) => {
      const strongestBaseline = Math.max(...baselines.map(method => method.values[index].mean));
      return policy.values[index].mean - strongestBaseline;
    });
    return [task.id, margins.indexOf(Math.max(...margins))];
  }));
  function clipMarkup(task,entry,clip,i) {
    const success=clip.outcome==='Success',caption=`clip-${task.id}-${entry.method}-${i}`;
    return `<figure class="rollout-card"><div class="rollout-player"><video controls muted playsinline preload="none" poster="${esc(clip.poster)}" aria-describedby="${caption}" aria-label="${esc(`${task.name}: ${entry.name}, example ${i+1}, ${clip.outcome}, ${entry.condition_label}`)}"><source src="${esc(clip.video)}" type="video/mp4"></video><span class="rollout-verdict ${success?'success':'failure'}" hidden aria-hidden="true">${success?'✓':'×'} ${esc(clip.outcome)}</span></div><figcaption id="${caption}"><strong class="outcome-badge ${success?'success':'failure'}"><span aria-hidden="true">${success?'✓':'×'}</span> ${esc(clip.outcome)}</strong><span class="outcome-detail">${esc(clip.outcome_detail || '')}</span><span class="clip-timing">${esc(clip.clip_label)}</span></figcaption></figure>`;
  }
  function selectVideo(method) {
    const task = data.tasks[taskIndex];
    const methods = rollouts?.tasks[task.id];
    if (!methods?.length) return;
    const entry = methods.find(c => c.method === method) || methods.find(c => c.method === 'chronos') || methods[0];
    selectedMethods[task.id] = entry.method;
    $('#video-method').value = entry.method;
    const container = $(`.task-visual[data-video-task="${task.id}"]`);
    container.querySelectorAll('video').forEach(video=>video.pause());
    const info=rollouts.task_info?.[task.id];
    container.innerHTML = `${info?`<p class="task-success"><strong>Success:</strong> ${esc(info.success)}</p>`:''}<p class="video-summary"><strong>${esc(entry.name)} · Overall success ${entry.rate.mean.toFixed(2)} ± ${entry.rate.sd.toFixed(2)}%</strong><span>${esc(entry.condition_label)}</span></p><div class="rollout-grid">${entry.clips.map((clip,i)=>clipMarkup(task,entry,clip,i)).join('')}</div>`;
    container.querySelectorAll('.rollout-player').forEach((player,i)=>{
      const video=player.querySelector('video'),button=document.createElement('button');
      const verdict=player.querySelector('.rollout-verdict');
      function updateVerdict() { verdict.hidden=!video.ended; }
      video.controls=false;
      video.tabIndex=-1;
      button.type='button';button.className='rollout-play';
      button.setAttribute('aria-label',`Play ${video.getAttribute('aria-label')}`);
      button.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
      button.addEventListener('click',()=>{if(video.ended)video.currentTime=0;video.play().then(()=>video.focus()).catch(()=>{video.controls=true;video.tabIndex=0;button.hidden=true;video.focus();});});
      video.addEventListener('play',()=>{button.hidden=true;video.controls=true;video.tabIndex=0;updateVerdict();});
      video.addEventListener('seeked',updateVerdict);
      video.addEventListener('ended',()=>{const focused=document.activeElement===video;video.controls=false;video.tabIndex=-1;button.hidden=false;button.setAttribute('aria-label',`Replay ${video.getAttribute('aria-label')} from the start`);updateVerdict();if(focused)button.focus();});
      player.append(button);
      const expand=document.createElement('button');
      expand.type='button';expand.className='rollout-expand';
      expand.setAttribute('aria-label',`Enlarge ${task.name}, ${entry.name}, example ${i+1}`);
      expand.title='View larger';
      expand.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
      expand.addEventListener('click',async()=>{
        try{
          if(document.fullscreenElement===player){await document.exitFullscreen();return;}
          if(player.requestFullscreen)await player.requestFullscreen();
          else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();
          if(video.ended)video.currentTime=0;
          await video.play();
        }catch{video.controls=true;video.tabIndex=0;}
      });
      player.addEventListener('fullscreenchange',()=>{
        const enlarged=document.fullscreenElement===player;
        expand.title=enlarged?'Exit fullscreen':'View larger';
        expand.setAttribute('aria-label',enlarged?'Exit fullscreen':`Enlarge ${task.name}, ${entry.name}, example ${i+1}`);
      });
      player.append(expand);
    });
  }
  function videoOptions() {
    const task = data.tasks[taskIndex];
    const clips = rollouts?.tasks[task.id];
    $('#video-controls').hidden = !clips?.length;
    if (!clips?.length) return;
    $('#video-method').innerHTML = clips.map(c => element('option', {value:c.method}, c.name)).join('');
    selectVideo(selectedMethods[task.id] || 'chronos');
  }
  function drawResults() {
    if (!data || printing) return;
    const task = data.tasks[taskIndex], condition = Number($('#condition').value);
    $('#sample-count').textContent = '3 training seeds';
    $$('.results-panel').forEach(panel => {panel.hidden=panel.dataset.task!==task.id;});
    const width = Math.max(240, Math.round($('#result-chart').clientWidth)), compact = width < 480;
    const left = compact ? 8 : 220, right = compact ? 10 : 78, top = 15;
    const rowHeights = task.methods.map(method => compact ? (method.chart_lines ? 90 : 72) : 47);
    const bottom = top + rowHeights.reduce((sum, height) => sum + height, 0);
    const max = 100;
    const scale = value => left+(width-left-right)*value/max;
    let s = `<title>${esc(task.name+' — '+data.conditions[condition].name)}</title><desc>${esc(task.methods.map(m=>{const v=m.values[condition];return v?`${m.name}: ${v.mean.toFixed(2)} ± ${v.sd.toFixed(2)} percent`:`${m.name}: evaluation pending`;}).join('; '))}.</desc>`;
    for(let value=0;value<=max;value+=20){
      s+=element('line',{x1:scale(value),x2:scale(value),y1:top,y2:bottom-5,stroke:colors.line,'stroke-dasharray':value?'2 4':'0'});
      s+=element('text',{x:scale(value),y:bottom+19,'text-anchor':'middle',fill:colors.muted,'font-size':14},value);
    }
    let rowY = top;
    task.methods.forEach((method,i)=>{
      const rowHeight=rowHeights[i],y=rowY;rowY+=rowHeight;
      const v=method.values[condition],ours=method.name==='Chronos Policy';
      const textY=compact?y+16:y+23,barY=compact?y+(method.chart_lines?45:27):y+7,barHeight=24,cy=barY+barHeight/2;
      if(ours)s+=element('rect',{x:0,y:y-3,width,height:rowHeight-2,fill:colors.wash});
      (method.chart_lines || [method.name]).forEach((line,j)=>{
        const labelY=method.chart_lines?(compact?y+16:y+14)+j*18:textY;
        s+=element('text',{x:compact?left:left-14,y:labelY,'text-anchor':compact?'start':'end','font-size':compact?15:16,'font-weight':ours?650:400,fill:ours?'#9b4e30':colors.ink},line);
      });
      if(!v){
        s+=element('text',{x:width-3,y:textY,'text-anchor':'end','font-size':compact?15:16,fill:colors.muted},'Pending');
        return;
      }
      s+=element('rect',{x:left,y:barY,width:Math.max(0,scale(v.mean)-left),height:barHeight,fill:ours?colors.accent:colors.bar});
      if(v.mean===0)s+=element('circle',{cx:left,cy,r:2,fill:ours?colors.accent:colors.bar});
      s+=element('text',{x:width-3,y:textY,'text-anchor':'end','font-size':compact?15:16,'font-weight':ours?650:400,fill:ours?'#9b4e30':colors.ink},v.mean.toFixed(2));
      s+=element('text',{x:width-3,y:compact?barY+39:textY+17,'text-anchor':'end','font-size':compact?13:14,fill:colors.muted},`± ${v.sd.toFixed(2)}`);
    });
    $('#result-chart').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(task.name+' success rates')}" viewBox="0 0 ${width} ${bottom+31}">${s}</svg>`;
  }
  function selectTask(index,focus=false){
    if(index<0||index>=data.tasks.length)return;
    taskIndex=index;
    const task=data.tasks[index];
    $('#condition').value=String(selectedConditions[task.id] ?? defaultConditions[task.id]);
    $$('.task-tabs [role=tab]').forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;if(focus&&i===index)button.focus();});
    $('#result-panel').setAttribute('aria-labelledby',`tab-${data.tasks[index].id}`);
    $$('.task-visual').forEach(figure=>{
      const active=figure.dataset.videoTask===data.tasks[index].id;
      if(!active)figure.querySelectorAll('video').forEach(video=>video.pause());
      figure.hidden=!active;
    });
    videoOptions();
    drawResults();
  }
  $$('.task-tabs button').forEach((button,i)=>{
    button.addEventListener('click',()=>selectTask(i));
    button.addEventListener('keydown',e=>{
      const indices={ArrowRight:(i+1)%4,ArrowLeft:(i+3)%4,Home:0,End:3};
      if(e.key in indices){e.preventDefault();selectTask(indices[e.key],true);}
    });
  });
  $('#condition').addEventListener('change',()=>{selectedConditions[data.tasks[taskIndex].id]=Number($('#condition').value);drawResults();});
  $('#video-method').addEventListener('change',event=>selectVideo(event.target.value));
  function revealHash(){
    let target=document.getElementById(location.hash.slice(1));if(!target)return;
    if(target.matches('.task-tabs [role="tab"]'))selectTask(data.tasks.findIndex(t=>t.id===target.dataset.task));
    if(target.classList.contains('results-panel'))selectTask(data.tasks.findIndex(t=>t.id===target.dataset.task));
  }
  window.addEventListener('hashchange',revealHash);
  let frame;
  new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{drawResults();});}).observe($('#result-chart'));
  window.addEventListener('beforeprint',()=>{printing=true;$$('.results-panel').forEach(p=>p.hidden=false);});
  window.addEventListener('afterprint',()=>{printing=false;drawResults();});
  selectTask(0);revealHash();
})();
