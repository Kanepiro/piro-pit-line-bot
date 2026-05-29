module.exports = async function handler(req, res) {
  res.status(302).setHeader("Location", "/api/status");
  res.end();
};
