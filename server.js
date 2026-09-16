const express = require("express");
const checkoutRoute = require("./routes/checkout");
const { renderDashboard } = require("./services/dashboard");
const { processRefund } = require("./services/refunds");
const { getPrice } = require("./services/pricing");
const { runVerification } = require("./services/kyc");

const app = express();

app.use("/checkout", checkoutRoute);

app.get("/dashboard", (req, res) => {
  res.send(renderDashboard());
});

app.post("/refunds/:orderId", (req, res) => {
  res.json(processRefund(req.params.orderId));
});

app.get("/pricing/:sku", (req, res) => {
  res.json({ price: getPrice(req.params.sku) });
});

app.post("/kyc/verify", (req, res) => {
  res.json(runVerification(req.body));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ledger-web listening on ${PORT}`));

module.exports = app;
