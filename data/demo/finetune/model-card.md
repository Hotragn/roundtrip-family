---
base_model: Qwen/Qwen3.5-4B
library_name: peft
license: apache-2.0
language:
- te
tags:
- lora
- peft
- telugu
- tinker
- synthetic-data
pipeline_tag: text-generation
---

# Roundtrip card writer for Telugu (Qwen3.5-4B LoRA)

A LoRA adapter for [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) that turns an outing's facts into a short card in Telugu for a parent who is visiting family abroad: where they're going, when, how to get there and back, and one thing they'll like. It is the card writer of [Roundtrip](https://github.com/Hotragn/roundtrip-family), a planner that helps visiting parents get out to real places on their own.

Cards are coastal Andhra (Guntur) Telugu, warm and respectful (మీరు forms, అమ్మా for a mother and నాన్నగారు for a father), 60 words or fewer, with every bus, street, stop and venue name kept in English letters so it matches the signs.

## The training data is synthetic

- 342 training cards for 360 synthetic outings, and 40 more outings held out for evaluation.
- Venues, bus lines and stop names come from public place listings and transit directions saved from live searches in Fremont (California), Munich and Bozeman (Montana). Everything else is invented: who goes, the day and times, which stops they ride between, walks, family outings and a few events. The family is fictional, a couple from Guntur. There are no real people, names, addresses or phone numbers in the data.
- Cards were drafted by Qwen/Qwen3.5-397B-A17B with the project's style guide and kept only when they passed code checks (60 words or fewer, every given name exactly, no number or English text that isn't in the input, the right address form, a respectful మీరు form, intact Telugu script) and an automated tone and facts judge (Gemma 4 26B A4B, a different model family). A failing draft was regenerated once, then dropped.
- No native speaker has reviewed the data or the outputs.

## Training

One LoRA run on [Tinker](https://tinker-docs.thinkingmachines.ai/), by prompt distillation: the style guide is not in the prompt, so the adapter learned it from the kept cards. Rank 32, learning rate 4.9e-4 with linear decay, 3 epochs, batch size 16, 326 examples (282,198 tokens), loss on the answer only, thinking turned off. Loss on 16 held-back examples went from 1.166 before training to 0.111 after the third epoch.

## Evaluation (automated, not reviewed by native speakers)

40 held-out synthetic outings at places that never appear in the training data. Each writer gets one corrective retry, as in the app.

| | Qwen3.5-4B with the style guide | This adapter, facts only | Gemma 4 26B A4B with the style guide |
|---|---|---|---|
| Passes every code check | 29/40 (72%) | 39/40 (98%) | 34/40 (85%) |
| Passes on the first draft | 29/40 (72%) | 38/40 (95%) | 20/40 (50%) |
| Every given name kept exactly | 100% | 100% | 100% |
| Tone rated 4 or 5 by Gemma | 17/40 | 39/40 | 39/40 |
| Facts supported, per Gemma | 16/40 | 40/40 | 39/40 |

Order-swapped pairwise judging (each pair judged twice with the cards swapped; a win counts only when both orders agree): this adapter beat the base model 36 to 1 with 3 ties, judged by Gemma. Against the Gemma writer it lost 8 to 20 with 12 ties when Gemma judged, and won 14 to 12 with 14 ties when Kimi-K2.6, a third model family, judged.

## How to use it

Send one user message and no system prompt, in exactly the format the app uses:

```text
Write the card for the mother. Address them as అమ్మా.
Venue: Central Park
When: బుధవారం, leave at 08:30, back by 10:28
Trip: walk 3 minutes to Fremont Blvd & Mowry Av; take Bus 210 toward Ohlone College for 4 stops, get off at Fremont Blvd & Stevenson Blvd; walk 21 minutes to Central Park
What's there: Lakeside park with walking paths
Names to keep exactly, in English letters: Central Park; Bus 210; Fremont Blvd & Mowry Av; Fremont Blvd & Stevenson Blvd
Answer with only JSON: {"title": "...", "body": "..."}
```

Add `Other stops on the way (mention only if needed): ...` for a transfer, and `This is the first card of the visit: end with the one-line safety tip.` for the first card of a visit. Turn thinking off in the chat template.

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen3.5-4B")
base = AutoModelForCausalLM.from_pretrained("Qwen/Qwen3.5-4B")
model = PeftModel.from_pretrained(base, "roundtrip-family/roundtrip-card-writer-te-qwen3.5-4b-lora")
text = tokenizer.apply_chat_template(
    [{"role": "user", "content": prompt}], tokenize=False, add_generation_prompt=True, enable_thinking=False
)
inputs = tokenizer(text, return_tensors="pt")
output = model.generate(**inputs, max_new_tokens=400, temperature=0.4, do_sample=True)
print(tokenizer.decode(output[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True))
```

With vLLM: `vllm serve Qwen/Qwen3.5-4B --enable-lora --lora-modules card-writer=roundtrip-family/roundtrip-card-writer-te-qwen3.5-4b-lora`.

## Limits

- Its Telugu was judged by models, not by people, and some cards contain an odd or made-up word.
- It states the walk minutes for about half the walks in a trip (27 of 58 on the held-out set), a habit it learned from the teacher.
- It was trained on outings in three areas with English and German place names; other places, longer trips and other output languages are untested.
- It doesn't name the bus's direction ("toward ..."), because the app's checks only allow the names it lists.

## License

Apache 2.0, the license of the base model Qwen/Qwen3.5-4B. The style guide, the dataset code and the evaluation are in the Roundtrip repository.
