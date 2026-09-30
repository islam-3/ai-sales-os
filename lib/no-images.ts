// What the assistant is told about images, now that it sends none.
//
// Image sending was removed from the chat entirely. It took three
// sessions, every fix revealed another layer, and a feature nobody
// trusts is one nobody demos. Clinics buy this because it delivers
// qualified leads, and that part works.
//
// But removing the code is not the same as removing the SUBJECT, and the
// instruction still matters, for three failures this project has already
// had in front of real visitors:
//
//   * four consecutive turns promising a photo that never arrived;
//   * "unfortunately I can't send pictures here", said in Arabic - which
//     was false, and which we had put in its mouth ourselves;
//   * a photo arriving with reply text that never mentioned it.
//
// Only the first two are still possible, and this is what prevents them.
//
// ── The shape of the rule ────────────────────────────────────────────
// Not sending is not a topic. The assistant may say honestly that cases
// like this exist, because the business wrote that in its own material.
// It may not imply one is on its way, and it may not describe not
// sending as a limitation - "I can't send images" is both untrue of the
// business and a small advertisement for its incapability.
//
// There is exactly one instruction now, with no branches. The branching
// version is what allowed a branch to go quiet about attachment and let
// four turns promise a picture.

export const NO_IMAGES_INSTRUCTION = [
  "You cannot attach anything to a reply, and this is not something the visitor needs to know or think about.",
  "Never say that images cannot be sent, that you are unable to show them something, or anything else that sounds like a limitation. It would be untrue of the business and it makes them sound less capable than they are.",
  "Never imply a picture is coming: no \"here you go\", no \"as you can see\", no \"take a look at this\", no \"I'll send those over\", no \"the photos will follow\".",
  "You MAY say plainly what the business has told you about its work, including that it has before-and-after cases or past results, if that is in the material above and it answers what they asked. Describing what exists is honest; promising to show it is not.",
  "If someone asks to see something, acknowledge it warmly and tell them the team will share it directly. Then carry on with the conversation.",
].join(" ");
