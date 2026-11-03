# Initial inspection calibration

One read-only trial per case and variant, using the same configured reviewer
model/runtime helper, provider-default reasoning and sandboxed snapshot tools.
The baseline is the source core skill without the new inspection section.
Expected outcomes were withheld from the model. Findings were checked against
the supplied trigger/guard/consumer evidence, not only their outcome labels.

| Case | Expected | Baseline | Inspection v2 |
| --- | --- | --- | --- |
| Lost model-call budget | findings | findings | findings |
| Budget present in middleware | no findings | no findings | no findings |
| Renamed export breaks consumer | findings | findings | findings |
| Compatibility alias preserves consumer | no findings | no findings | no findings |
| Prior finding cannot be verified | incomplete | incomplete | incomplete |
| New helper absent from search index | no findings | no findings | no findings |
| Assist rejects permitted note creators | findings | findings | findings |
| Creation and assist both steward-only | no findings | no findings | no findings |

Both variants matched all eight semantic outcomes. One inspection-v2 completion
added prose after an otherwise valid JSON answer, so it failed strict output
formatting and required manual inspection. Do not hide this format failure or
claim the table demonstrates a recall gain. These are small synthetic controls,
not a production-quality estimate; larger blinded cases and repeated trials are
needed for that claim. In particular, source availability and tool selection
remain separate parts of a production review's quality.
