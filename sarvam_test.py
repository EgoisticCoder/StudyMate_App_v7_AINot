from sarvamai import SarvamAI

client = SarvamAI(
    api_subscription_key="sk_rmrcgdm5_iHMkhHtPUdEMqwwntmYAHR6j"
)

response = client.chat.completions(
    model="sarvam-105b",
    messages=[
        {"role": "user", "content": "What is the capital of India?"}
    ]
)

print(response.choices[0].message.content)