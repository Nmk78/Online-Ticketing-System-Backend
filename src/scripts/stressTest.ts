import http from "http";

function makeRequest(
  method: string,
  path: string,
  body: Record<string, unknown> | null = null,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 3000,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode || 0,
            body: JSON.parse(data),
            headers: res.headers as Record<string, string>,
          });
        } catch {
          resolve({ status: res.statusCode || 0, body: data, headers: res.headers as Record<string, string> });
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function stressTest() {
  console.log("=== STRESS TEST: Simultaneous Ticket Purchase ===\n");

  const concertId = 3;
  const concurrentUsers = 5;
  const results: Array<{ user: string; status: number; body: unknown }> = [];

  console.log(`Launching ${concurrentUsers} simultaneous requests for concert ${concertId}...`);

  const promises = Array.from({ length: concurrentUsers }, async (_, i) => {
    const correlationId = `stress-test-user-${i + 1}`;
    const res = await makeRequest(
      "POST",
      "/api/v2/reserve/pessimistic",
      { userId: `user-${i + 1}`, concertId },
      { "X-Correlation-ID": correlationId }
    );
    return { user: `user-${i + 1}`, status: res.status, body: res.body };
  });

  const allResults = await Promise.all(promises);

  console.log("\n--- Results ---");
  allResults.forEach((r) => {
    const body = r.body as Record<string, unknown>;
    console.log(`  ${r.user}: ${r.status} - ${body.message || body.error}`);
    results.push(r);
  });

  const successes = results.filter((r) => r.status === 201).length;
  const failures = results.filter((r) => r.status !== 201).length;

  console.log(`\nSummary: ${successes} succeeded, ${failures} failed`);
  console.log(successes === 1 ? "LOCKING WORKED: Only one user got the ticket" : "LOCKING FAILED: Multiple users got tickets");

  console.log("\n=== VALIDATION FLOW DEMO ===\n");

  const valRes = await makeRequest(
    "POST",
    "/api/v2/reserve",
    { userId: "test", concertId: "not-a-number", extraField: "bad", quantity: 99 },
    { "X-Correlation-ID": "validation-demo" }
  );

  console.log("Request with invalid data sent:");
  console.log(`  Body: { userId: "test", concertId: "not-a-number", extraField: "bad", quantity: 99 }`);
  console.log(`  Response: ${valRes.status} - ${JSON.stringify(valRes.body)}`);
  console.log(`  X-Correlation-ID header: ${(valRes.headers as any)["x-correlation-id"]}`);
}

stressTest().catch(console.error);
