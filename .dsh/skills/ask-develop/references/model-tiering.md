# Model Tiering

| Complexity | Tier → model | Fits |
|---|---|---|
| Mechanical, boilerplate, bounded parsing | light / mini → **mini** | payment-service split |
| Nuanced but contained | standard / default → **default** | report pipeline |
| Cross-cutting, implicit reasoning, error handling | heavy / high → **high** | coordinator-service refactor |