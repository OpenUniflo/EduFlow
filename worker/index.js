const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    const url = new URL(request.url);
    const acceptsHtml = request.method === "GET"
      && (request.headers.get("accept") ?? "").includes("text/html");

    if (!acceptsHtml) return response;

    url.pathname = "/index.html";
    url.search = "";
    return env.ASSETS.fetch(new Request(url, request));
  },
};

export default worker;
