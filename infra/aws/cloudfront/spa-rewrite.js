function handler(event) {
  var request = event.request;
  var uri = request.uri || "/";

  // API requests must reach the VPC origin unchanged.
  if (uri === "/api" || uri.indexOf("/api/") === 0) return request;

  // Existing files, including hashed assets, remain unchanged.
  if (uri.indexOf(".") !== -1) return request;

  request.uri = "/index.html";
  return request;
}
