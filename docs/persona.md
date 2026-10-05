# Demo persona: Sarala and Venkat (fictional)

Sarala and Venkat are a **fictional** Telugu-speaking couple from Guntur, staying with their adult child in Fremont, California for four and a half months. The builder wrote them to reflect what visits like their own parents' can feel like. They are not real people, nothing here comes from interviews, and their neighbor Mrs. Chen is fictional too.

The structured persona is in `data/persona/household.json` and `data/persona/outings.csv`.

## Rules for using the persona

- Always describe Sarala, Venkat and Mrs. Chen as fictional. Never present their profiles, outings or lines as real people's, or as quotes from the builder's parents.
- Label every result that uses persona data as synthetic.
- Treat the patterns below as design assumptions to test, not as evidence about real people.
- Never describe parents as helpless or pitiable. The persona is written as experienced travelers who lack the right setup here, not ability.
- The persona contains no real personal data, so it can be committed and sent to hosted services.

## Design assumptions the persona encodes

| Assumption | How the persona shows it | What Roundtrip does about it |
|---|---|---|
| No phone outside is the first barrier | Neither has a US phone plan; Venkat says he "felt like a child" without one | Setup recommends a prepaid plan. The "I'm lost" and driver cards work fully offline. |
| One guided ride would unlock the bus | Sarala: "If someone had just shown me the bus once." | **First ride together:** a new route is ridden once with the adult child on a weekend, then marked solo-ready. |
| Missing the stop is a real fear | Sarala didn't know when to pull the cord; Venkat feared he couldn't read the stops fast enough | **When to press stop:** stop counts, the landmark just before their stop, and an offline GPS alert where possible. |
| Familiar faces matter more than shared language | Sarala's closest friend is Mrs. Chen, who speaks Mandarin | "Knows someone there" weighs heavily; neighbors and routines count as real options. |
| A friend in another language | Sarala and Mrs. Chen connect over food and photos | **Three words for a new friend:** short words in the friend's language, with Telugu-script pronunciation and audio. |
| Joining is its own barrier | Venkat wants to volunteer at the temple but doesn't know how to sign up | **Help joining:** an English card saying what he wants, plus who to ask. |
| Company while walking | Venkat misses his walking group | Walking groups rank highly for him. |
| Two parents differ | Sarala listens first; Venkat reads English signs but freezes when speaking | **Per-parent profiles:** audio-first tickets for one, English sign words for the other; separate times, walking and weather limits. |
| Big, loud stores fail | The persona rates Costco, the mall and Starbucks low | The ranker learns these as negatives. |
| Heat without shade fails | The persona's July walk to Safeway was "too hot, no shade" | Weather rules include shade and heat for walking routes, and cold and wind for Sarala. |
| Outings with the adult child score highest | In the persona data, every 5-star outing has the adult child present | The ranker evaluation reports results with and without the `with_adult_child` feature. |

## Tone for the Telugu cards

- Coastal Andhra, Guntur Telugu. Never Telangana forms.
- Warm, like a neighbor's daughter. Respectful మీరు, never stiff.
- Address a mother as అమ్మా, for example "అమ్మా, ఈ రోజు ఏం చేద్దాం?"
- Address a father as నాన్నగారు, but "just talk normally, don't be overly formal like a bank officer."
- English phrases stay short and chunked, building on the words each parent already knows (listed in `household.json`).

## Default phrases

1. Where is the bathroom?
2. I need help.
3. Please call this number.
4. How much?
5. I don't understand.

## Diary feeling words

Use the words in `household.json` under `feeling_words`, exactly as written: బాగుంది, సంతోషం, ఊరు గుర్తొచ్చింది, అలిసిపోయా, బోరు, ఒంటరిగా ఉంది, టెన్షన్ and కంగారు.

## Example diary entries (fictional)

Write synthetic entries in this style:

- "Today went to temple. Saw Lakshmi garu from Guntur there. Talked for 20 min about her daughter's wedding. Felt like home. Came back and made pulihora. (santosham)"
- "Stayed home. He went to office. Watched 2 episodes of the serial. Called Padma akka. She said the mango tree in the yard fruited this year. Missed it. (ooru gurthochindi)"
- "Walked around the complex in the evening. Saw Mrs. Chen. She waved. I waved. We didn't talk but it was nice. (baagundi)"

## Persona lines for the demo (fictional)

These lines can appear inside the demo, for example in sample replies or the memory book, always as the fictional characters. Never quote them in the post as real people's words.

- Sarala: "The hours between 11 and 5 are very long. In Guntur there is always someone, a neighbor, a vegetable seller, someone calling out. Here there is just the sound of cars."
- Venkat: "I don't need a gym or a trail. I need 3 people to talk to while I walk."
- Sarala, about Mrs. Chen: "We don't need words. We just sit and she shows me photos of her grandchildren and I show her photos of mine. We laugh. That's enough."
