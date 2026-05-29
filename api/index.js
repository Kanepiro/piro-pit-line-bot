module.exports = async function handler(req, res) {
  res.status(302).setHeader("Location", "/api/admin");
  res.end();
};
