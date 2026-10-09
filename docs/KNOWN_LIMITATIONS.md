# Known Limitations

- **Not tested against real services in this build.** Gemini, Grok and Supabase calls are covered by unit/mock tests only. Real provider and database testing needs your credentials. After adding them, use `/architecture` → "Run live router test", and run each experiment once.
- **Supabase SQL** was written to match the application's queries (checked column by column) but has not been executed against a live project here.
- Rate limiting, nonce replay protection and the demo issuer keys are in memory (single instance). Use a shared store for multi-instance deployments.
- Blood module is an educational simulation, not for clinical use; it does not replace crossmatching or blood-bank protocols.
- Nutrition and environmental figures are estimates from reference tables and stated assumptions.
- Trust uses a teaching-grade zero-knowledge range proof (secp256k1, Pedersen commitments, OR-proofs), not production-grade cryptography. The demo "issuer" sees the date of birth once to issue the credential; the verifier never does.
- Expiry's "advance clock" is a simulated offset sent with each spend attempt. It is a prototype currency with no real monetary value.
- Photo understanding quality depends on the configured vision model.
- Landing and lab 3D scenes need WebGL; otherwise a 2D fallback is shown.
