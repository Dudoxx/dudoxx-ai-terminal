# c2-health-schema — progress

## Status: completed

## Files modified
- `packages/ddx-term-contract/src/session.ts` — added BrokerHealthSchema + BrokerHealth type
  (inserted before SessionDescriptorSchema; already re-exported via existing index.ts barrel)

## Validation output (tail)
```
> @ddx/term-contract@0.1.0 typecheck
> tsc --noEmit -p tsconfig.json
(clean, exit 0)
```

## Deviations
None. service field is z.literal('ddx-term-broker') per task contract.
