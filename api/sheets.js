// Vercel Serverless Function — proxies requests to Google Apps Script
// This runs on YOUR server, not in the browser, so CORS is not an issue

export default async function handler(req, res) {
  // Allow requests from your Vercel app
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { scriptUrl, action, pin, data } = req.method === "POST"
    ? req.body
    : req.query;

  if (!scriptUrl || !action) {
    return res.status(400).json({ ok: false, error: "Missing scriptUrl or action" });
  }

  try {
    const params = new URLSearchParams({ action });
    if (pin)  params.append("pin",  pin);
    if (data) params.append("data", typeof data === "object" ? JSON.stringify(data) : data);

    const url = `${scriptUrl}?${params.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = { ok: false, error: "Bad response from Google: " + text.slice(0, 200) };
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.toString() });
  }
}
