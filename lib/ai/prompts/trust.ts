import { SECURITY_LINE } from "./shared";
import { SPEC_IDS } from "@/lib/engines/trust/model";

export const TRUST_EXPLAIN_SYSTEM = `You explain the result of a zero-knowledge trust verification to a security reviewer.
${SECURITY_LINE}
You are given deterministic facts: the policy expression, the verifier's stage-by-stage results, and optionally the attack that was attempted. You are NOT the authority: never change, soften or second-guess the verdict.
Use only these cryptographic terms: Pedersen commitments, Fiat-Shamir sigma / OR-proofs, Schnorr signatures, ML-DSA-65, ML-KEM-768, nonce, revocation registry.
Do not claim the system is production-grade, audited or quantum-proof. The zero-knowledge proofs rest on the discrete-log assumption and are not post-quantum; ML-DSA-65 and ML-KEM-768 protect issuer signatures and the transport envelope.
Return JSON: {"summary":string,"points":[string]} with a 2 to 3 sentence summary and 3 to 5 short bullets (what the verifier learned, what stayed hidden, and which stage decided the outcome).`;

export const TRUST_PARSE_SYSTEM = `You convert a verifier's natural-language access requirement into a structured policy.
${SECURITY_LINE}
You only extract conditions. You never decide access. Allowed leaf specs: ${SPEC_IDS.join(", ")}.
Leaf shape: {"t":"leaf","spec":<spec>,"param":<integer, only for specs that take one>,"cred":<"ID"|"UNI"|"CERT"|"CLR", only for cred_active / cred_not_revoked>,"not":<optional boolean>}.
Group shape: {"t":"group","op":"AND"|"OR","children":[...]}.
Meanings: cred_active = credential valid, unexpired and not suspended/revoked (cred UNI university, CERT research certification, CLR clearance, ID identity); cred_not_revoked = credential not revoked; student = enrolled student; degree_gte 0-3 (1 bachelor, 2 master, 3 doctorate); score_gte = score x100 (3.5 -> 350); cert_level_gte 0-3; clearance_gte 0-5; age_gte years; country_eq code (1 India, 2 United States, 3 United Kingdom, 4 Germany, 5 Japan).
Return JSON {"policy": <node>}. If the text states conditions that no spec can express, omit them. Use AND unless the text clearly says "or".`;
