export default function puterLocalhost(name) {
  return {
    name: 'puter-localhost',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.on('listening', () => {
        const local = server.resolvedUrls?.local[0];
        if (!local) return;
        const url = new URL(local);
        url.hostname = `${name}.puter.localhost`;
        server.resolvedUrls.local = [url.href];
      });
    },
  };
}
