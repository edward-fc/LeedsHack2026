
import pandas as pd

df = pd.read_csv("panama_canal_transits_merged.csv")

print("--- Data Stats ---")
print(df['delay_hours'].describe())

print("\n--- Target Distribution ---")
print(df['is_delayed'].value_counts(normalize=True))

print("\n--- Stormy Records (Rain > 30) ---")
stormy = df[df['rainfall_mm'] > 30]
print(f"Count: {len(stormy)}")
print(stormy['delay_hours'].describe())
print(f"Delayed Flag Rate in Stormy: {stormy['is_delayed'].mean():.2%}")

print("\n--- Backlog & Booking Stats ---")
print(f"Queue Length Stats:\n{df['queue_length'].describe()}")
print(f"Booking Rate: {df['is_booked'].mean():.2%}")

print("\n--- Extreme Delays (Queue > 150 & Non-Booked) ---")
extreme = df[(df['queue_length'] > 150) & (df['is_booked'] == 0)]
if len(extreme) > 0:
    print(f"Count: {len(extreme)}")
    print(extreme['delay_hours'].describe())
    print(f"Avg Delay: {extreme['delay_hours'].mean():.2f} hrs")
else:
    print("No extreme backlog records found (Normal if random generation didn't spike demand).")

print("\n--- Continuous Delay Validation ---")
bins = [
    (20, 40, "Queue 20-40 (Target ~40h at 30)"),
    (50, 70, "Queue 50-70 (Target ~160h at 60)"),
    (75, 85, "Queue 75-85 (Target ~288h at 80)"),
    (90, 110, "Queue 90-110 (Target ~450h at 100)"),
    (140, 300, "Queue > 140 (Extreme)")
]

for low, high, label in bins:
    subset = df[(df['queue_length'] >= low) & (df['queue_length'] <= high) & (df['is_booked'] == 0)]
    if len(subset) > 0:
        print(f"\n{label}:")
        print(f"  Count: {len(subset)}")
        print(f"  Avg Delay: {subset['delay_hours'].mean():.2f} hrs")
        print(f"  Min/Max: {subset['delay_hours'].min():.1f} - {subset['delay_hours'].max():.1f}")
    else:
        print(f"\n{label}: No records found.")
