# Coding Standards

Geldt voor alle projecten.

## Core Principles

- **DRY**: Before adding code, check if similar functionality exists. Refactor 3+ duplications into shared components.
- **SOLID**: Single responsibility, open/closed, Liskov substitution, interface segregation, dependency inversion.
- **Small functions**: Prefer small focused helpers with a single level of abstraction. Orchestrator methods may be larger when coordinating phases, but must delegate real work to named helpers.
- **Pure functions**: Prefer functions without side effects when possible.
- **Meaningful names**: Use descriptive, intention-revealing names for all identifiers.

## Senior Delivery Patterns

- **Domain naming over transport naming**: Rename models and helpers to business language when that improves intent and downstream readability.
- **Structured diagnostics**: Log with business identifiers and operation context to make production troubleshooting deterministic.
- **Refactor by extraction**: Reduce large services by moving object-building and report-aggregation logic into dedicated builders/helpers while keeping behavior unchanged.
- **Keep generic builders generic**: Infrastructure helpers may assemble reusable templates, but domain-specific logic stays in domain helpers.
- **Prefer direct config lookups for simple settings**: For small, single-use config values, use direct `Configuration["Section:Key"]` access over dedicated settings classes.

## C# Specific Rules

- **Integration tests**: API responses must use concrete client/service models. `ApiJsonRequestAsync<object>` and `ApiJsonRequestAsync<JsonElement>` are forbidden when a real model exists.
- **No fully qualified type names**: Add `using` directives and use short names.
- **No long parameter lists**: 3+ parameters → use a request DTO.
- **Parameter formatting**: Keep on one line if it fits; prefer DTO over multiline.
- **Method invocation formatting**: Keep on one line when possible.
- **Variable naming**: Use intention-revealing names, avoid generic `code`/`result`/`data`.
- **No `dynamic`**: Use strongly-typed classes, `object` with safe casting, or `JsonElement`/`JObject`.
- **Constructor optimization**: Prefer optional params with defaults, factory methods, or builders over touching many files.
- **XML docs**: Add `///` to all methods, classes, records, and helpers (public, internal, private).
- **Control flow**: Prefer `switch`/pattern matching over long `if/else` chains. Guard clauses and early returns.
- **System.Text.Json**: Don't combine `[Required]` with non-public setters unless `[JsonInclude]` is added.

## EF Core

- **Centralize timestamps** in `DbContext.SaveChanges()` override.
- **Fluent API**: Use `HasDefaultValueSql("GETUTCDATE()")` for DB-level defaults.
- **Bulk operations**: Manually set timestamps before `BulkInsertAsync()`/`BulkUpdateAsync()`.

## Error Handling & Performance

- **Fail fast**: Validate inputs early with clear error messages.
- **Resource management**: Use `using` for disposable resources.
- **Lazy loading**: Don't compute values until needed.
- **Caching**: Cache expensive computations and frequently accessed data.

## Quality Checklist (after every change)

- No code duplication introduced
- Performance impact acceptable
- Error handling comprehensive
- Build: 0 errors, 0 warnings
- All tests passing
- External integration changes include dry-run and idempotency coverage
- Code is self-documenting or has "why" comments where needed
