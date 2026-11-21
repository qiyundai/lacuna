export function onRequest({request,env}) {
  const upstream=new URL(new URL(request.url).pathname,env.REFLECTION_WORKER_ORIGIN || 'https://lacuna-api.pianoquin4126.workers.dev');
  return fetch(new Request(upstream,request),{redirect:'manual'});
}
