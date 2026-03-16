"""
GPT-4o-mini Art Director — enriquece prompts según reglas de marca del proyecto.
"""
import os
from openai import AsyncOpenAI

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))


async def enrich_prompt(
    user_prompt: str,
    brand_rules: str | None,
    negative_constraints: str | None,
    brand_tone: str | None,
    quality_bar: str | None,
    trigger_word: str | None,
) -> str:
    system = """You are an expert Art Director. Your job is to enhance image generation prompts
for a specific brand, maintaining brand consistency while maximizing visual quality.
Return ONLY the enhanced prompt, nothing else."""

    brand_context = ""
    if brand_rules:
        brand_context += f"\nBrand rules: {brand_rules}"
    if negative_constraints:
        brand_context += f"\nAvoid: {negative_constraints}"
    if brand_tone:
        brand_context += f"\nTone: {brand_tone}"
    if quality_bar:
        brand_context += f"\nQuality: {quality_bar}"

    messages = [
        {"role": "system", "content": system + brand_context},
        {"role": "user", "content": f"Enhance this prompt: {user_prompt}"},
    ]

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=500,
            temperature=0.7,
        )
        enhanced = (response.choices[0].message.content or "").strip()
        if not enhanced:
            enhanced = user_prompt
    except Exception:
        # If OpenAI is unavailable or key is missing, fall back to original prompt
        enhanced = user_prompt

    # Añadir trigger word si existe
    if trigger_word and trigger_word not in enhanced:
        enhanced = f"{trigger_word} {enhanced}"

    return enhanced
