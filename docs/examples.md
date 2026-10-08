# Examples

Illustrative before and after examples of what ASK's standards and skills ask for. They show the intent of `rules/coding-standards.md`, `code-review`, `verification`, `summary`, and `intake`; they are not captured transcripts. The rules are language-agnostic, the code below is C#.

## Contents

- Helpers
- Files
- Comments
- KISS
- Proof
- Grill rounds

## Helpers

The rule: small focused functions, named helpers, orchestrators that delegate real work, and reuse before adding. Before, one route handler parses, normalizes, and persists:

```csharp
app.MapPost("/orders/import", async (HttpRequest req, OrderDb db) =>
{
    var lines = (await new StreamReader(req.Body).ReadToEndAsync()).Split('\n');
    var orders = new List<Order>();
    foreach (var l in lines)
    {
        var p = l.Split(';');
        if (p.Length < 3) continue;
        orders.Add(new Order { Sku = p[0].Trim().ToUpper(), Qty = int.Parse(p[1]), Price = decimal.Parse(p[2]) });
    }
    db.Orders.AddRange(orders);
    await db.SaveChangesAsync();
    return Results.Ok(orders.Count);
});
```

After, the handler orchestrates and a named helper parses:

```csharp
// Imports "sku;qty;price" lines and reports how many orders were stored.
app.MapPost("/orders/import", async (HttpRequest request, OrderDb db) =>
{
    var orders = OrderLineParser.Parse(await new StreamReader(request.Body).ReadToEndAsync());
    db.Orders.AddRange(orders);
    await db.SaveChangesAsync();
    return Results.Ok(orders.Count);
});
```

```csharp
// Parses "sku;qty;price" lines into orders; lines with fewer than three fields are skipped.
public static class OrderLineParser
{
    // Splits the body into lines and parses every complete one.
    public static IReadOnlyList<Order> Parse(string body)
    {
        return body.Split('\n').Select(ParseLine).OfType<Order>().ToList();
    }

    // Parses one line, or returns null when it has fewer than three fields.
    private static Order? ParseLine(string line)
    {
        var fields = line.Split(';');
        if (fields.Length < 3)
        {
            return null;
        }

        // SKUs are stored upper-case so lookups match the warehouse feed.
        return new Order
        {
            Sku = fields[0].Trim().ToUpperInvariant(),
            Qty = int.Parse(fields[1]),
            Price = decimal.Parse(fields[2]),
        };
    }
}
```

Three or more duplications of the same shape become one shared helper. Before adding a parser at all, the agent checks whether the repository already has one.

## Files

The rule (.NET section): one public type per file, members in a consistent order, and a file-level purpose comment only when the filename does not already say what the file is for.

```text
Before                          After
Orders.cs (600 lines)           Orders/Order.cs
  Order                         Orders/OrderLineParser.cs
  OrderLine                     Orders/OrderValidator.cs
  parser                        Orders/OrderEndpoints.cs
  validator
  endpoints
```

## Comments

The rule: a short intent comment above every function, and a *why* comment wherever a future reader would ask "why". Never line-by-line narration. A missing intent comment is a blocking finding in review, and `scripts/check-code-comments.js` is the check this repository runs on itself.

```csharp
// Before: narrates what the code already says.
// add 1 to retries
retries++;

// After: states the reason.
// The carrier API allows 5 requests per second, so retry with backoff instead of failing the order.
retries++;
```

## KISS

The rule: reuse over reinvention, and no repositories, wrappers, workers, factories, or frameworks without a demonstrated need. The request was "cache the exchange rate". Before: an `IExchangeRateProvider`, an `ExchangeRateProviderFactory`, a `CachedExchangeRateDecorator`, and an `ExchangeRateOptions` class, all with one implementation. After:

```csharp
// Returns today's rate, cached for an hour because the provider updates daily.
public async Task<decimal> GetRateAsync(string currency)
{
    // Fetches the rate from the provider on a cache miss.
    return await cache.GetOrCreateAsync(currency, async entry =>
    {
        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1);
        return await client.FetchRateAsync(currency);
    });
}
```

When a layer does slip in, `code-review` labels it, for example "possible Speculative Generality: the factory has one implementation; inline it until a second one exists". Smells are judgment calls and the repository's own standards win.

## Proof

The rule: a claim needs evidence from this session. `verification` ties the claim to what was run, and `summary` reports it in a fixed shape derived from the diff:

```text
What:          CSV import now skips malformed lines and reports the stored count.
Changes:       OrderLineParser.cs (new), OrderEndpoints.cs (uses the parser).
Decisions:     skip bad lines instead of rejecting the file; rejecting loses good rows.
Proven:        dotnet test --filter OrderImport: 6 passed; dotnet format --verify-no-changes: clean.
Not proven:    imports over 10 MB.
Read yourself: OrderLineParser.cs:23 (int.Parse throws on a bad quantity).
Watch:         no new dependencies.
```

A small fix fits in six lines: What, Changes, Proven. Anything not run is listed as not proven, never implied.

## Grill rounds

When a plan has several open decisions, `intake` asks the whole open frontier in one round, each with a recommended answer worded so that "yes" accepts it. Facts in the repository are looked up, not asked.

```text
❓ Q1 - Cache scope: per process or shared across instances?
➡️ Per process. There is one instance today; add a shared cache when a second one exists.

❓ Q2 - Stale rates: is an hour of staleness acceptable?
➡️ Yes. The provider only updates daily.
```

Reply "yes" to accept both, or answer one differently. The next round only contains questions that the answers unlocked, and the session ends when nothing is left silently assumed.
