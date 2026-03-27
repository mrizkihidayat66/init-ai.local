# LLM Provider Setup Guide

This guide explains how to connect the application to an AI service. Open **Settings** (⚙️ icon) in the app, choose your provider, enter the required details, and click **Save**.

Use **⚡ Test Connection** after saving to confirm everything is working before generating a plan.

---

## ☁️ Cloud Providers

These providers give you access to powerful models via an API key. They are pay-as-you-go (you pay only for what you use) unless otherwise noted.

---

### 1. Anthropic (Claude) — Recommended

Anthropic's Claude models are strong at reasoning, instruction-following, and generating structured documents. Excellent choice for plan generation.

- **Provider:** Select `Anthropic`.
- **API Key:** Sign up at [console.anthropic.com](https://console.anthropic.com) → **API Keys** → Create key.
- **Recommended Models** (enter in the Models List field):
  - `claude-3-5-sonnet-20241022` — best quality, moderate cost
  - `claude-3-5-haiku-20241022` — fast and very affordable
  - `claude-3-7-sonnet-20250219` — latest, highest capability

**Pricing:** Pay-as-you-go. Haiku is one of the most cost-effective options available (~$0.25/M input tokens).

---

### 2. AgentRouter — Multi-Provider Bridge

AgentRouter is a routing layer that lets you use multiple models (Claude, GPT-4o, and others) through a single API key. Useful if you want to switch models without managing multiple subscriptions.

- **Provider:** Select `AgentRouter`.
- **API Key:** Get your key from [agentrouter.org/console/token](https://agentrouter.org/console/token).
- **Recommended Models** (enter in the Models List field):
  - `claude-3-5-sonnet` — routes to Anthropic Claude
  - `gpt-4o` — routes to OpenAI GPT-4o
- **Base URL:** Leave as default (`https://api.agentrouter.org/v1`).

---

### 3. OpenAI-Compatible Providers (via LM Studio)

Several cloud providers offer OpenAI-compatible APIs, which means you can use the **LM Studio (Local)** provider option with a custom Base URL to connect to them. This works for:

| Provider | Base URL | Notes |
|---|---|---|
| **Mistral AI** | `https://api.mistral.ai/v1` | European provider, affordable, strong coding models |
| **Groq** | `https://api.groq.com/openai/v1` | Very fast inference, generous free tier |
| **Together.ai** | `https://api.together.xyz/v1` | Wide model selection, competitive pricing |
| **Fireworks AI** | `https://api.fireworks.ai/inference/v1` | Fast, cost-effective open-source models |

**How to connect:**
1. Select **Provider:** `LM Studio (Local)`.
2. Enter the provider's **Base URL** from the table above.
3. Enter your **API Key** from that provider's console.
4. In **Models List**, enter the model name exactly as the provider expects (e.g. `mistral-large-latest`, `llama-3.3-70b-versatile`, `meta-llama/Llama-3-70b-chat-hf`).

---

## 💻 Local Providers (Free)

Run models entirely on your own machine — no API key required, no usage fees, and your data never leaves your device.

---

### 1. LM Studio (Recommended for Local)

LM Studio provides a desktop application that downloads and runs models locally with a one-click setup.

1. Download and install LM Studio from [lmstudio.ai](https://lmstudio.ai).
2. Inside LM Studio: search for a model (e.g. `nvidia/nemotron-3-nano-4b`), download it, then go to **Local Server** and click **Start Server**.
3. In the app settings:
   - **Provider:** Select `LM Studio (Local)`.
   - **Base URL:** `http://localhost:1234/v1` (default).
   - **API Key:** Leave unchanged (a dummy key is used automatically).
   - **Models List:** Enter the exact model name shown in LM Studio (e.g. `nvidia/nemotron-3-nano-4b`).
4. Click **⚡ Test Connection** to verify.

---

### 2. Ollama

Ollama runs open-source models via a lightweight local server managed from the terminal.

1. Install Ollama from [ollama.com](https://ollama.com) and run it.
2. Pull a model: `ollama pull llama3.3` (or another model of your choice).
3. In the app settings:
   - **Provider:** Select `Ollama (Local)`.
   - **Base URL:** `http://localhost:11434/v1` (default).
   - **Models List:** Enter the model name you pulled (e.g. `llama3.3`).
4. Click **⚡ Test Connection** to verify.

**Tip:** For plan generation, use a model with at least 7B parameters and good instruction-following ability (e.g. `meta-llama-3.1-8b-instruct`).

---

## ⚙️ Troubleshooting

| Problem | Solution |
|---|---|
| Test connection fails | Double-check the Base URL and API key. For local providers, make sure the server is running. |
| Saved key not shown | The app masks stored keys for security. The key is still loaded automatically when you test or generate. |
| Plan generation is slow | Switch to a faster/smaller model (e.g. Haiku instead of Sonnet, or a quantized local model). |
| Model not in the list | Type it manually in **Available Models List**, then select it from the **Active Model** dropdown. |
