self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const href = event.notification.data?.href || "/requests";
  const targetUrl = new URL(href, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientList) => {
        const matchingClient = clientList.find((client) => client.url === targetUrl);

        if (matchingClient && "focus" in matchingClient) {
          return matchingClient.focus();
        }

        const relayClient = clientList.find((client) =>
          client.url.startsWith(self.location.origin),
        );

        if (relayClient && "focus" in relayClient) {
          await relayClient.focus();

          if ("navigate" in relayClient) {
            return relayClient.navigate(targetUrl);
          }

          return relayClient;
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
