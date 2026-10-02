export function requestSpec(provider, prompt) {
  const anthropic = provider.format === 'anthropic';
  const deepseek = !anthropic && new URL(provider.baseUrl).hostname === 'api.deepseek.com';
  return {
    url:`${provider.baseUrl}/${anthropic ? 'messages' : 'chat/completions'}`,
    body:{ model:provider.model, ...(anthropic ? {max_tokens:8000} : {}),
      ...(deepseek ? {thinking:{type:'disabled'},max_tokens:8000,...(/JSON/i.test(prompt)?{response_format:{type:'json_object'}}:{})} : {}),
      messages:[{role:'user',content:prompt}] }
  };
}
export async function callModel(provider, key, prompt, {signal, fetchImpl=fetch, timeoutMs=90000}={}) {
  const spec=requestSpec(provider,prompt);
  const timeout=AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response=await fetchImpl(spec.url,{method:'POST',redirect:'error',signal:signal?AbortSignal.any([timeout,signal]):timeout,
      headers:{'Content-Type':'application/json',...(provider.format==='anthropic'?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{Authorization:`Bearer ${key}`})},body:JSON.stringify(spec.body)});
    if(!response.ok)throw Error(`AI 服务返回 HTTP ${response.status}，请检查余额、模型权限或稍后重试`);
    const body=await response.json();
    if(body.choices?.[0]?.finish_reason==='length'||body.stop_reason==='max_tokens')throw Error('模型输出达到长度上限，请减少本次任务或只导入部分课表');
    const answer=provider.format==='anthropic'?body.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n'):body.choices?.[0]?.message?.content;
    if(typeof answer!=='string'||!answer.trim())throw Error('模型未返回正文，请重试或检查接口设置');
    return answer;
  } catch(e) {
    if(timeout.aborted)throw Error('AI 请求超过 90 秒，已停止等待；请减少本次内容后重试');
    if(signal?.aborted)throw Error('已取消本次 AI 请求');
    if(e instanceof TypeError)throw Error('无法连接 AI 服务，请检查网络或接口地址');
    throw e;
  }
}
