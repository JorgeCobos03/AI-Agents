// Exact 0/1 knapsack planner. Freestanding C++20, shared by native and Wasm.
// No allocator, runtime, network, or user-provided code execution.
constexpr int MAX_TASKS = 20;
constexpr int MAX_BUDGET = 100;
static int costs[MAX_TASKS];
static int values[MAX_TASKS];
static int scores[MAX_TASKS + 1][MAX_BUDGET + 1];
static unsigned masks[MAX_TASKS + 1][MAX_BUDGET + 1];

extern "C" {
int set_task(int index, int cost, int value) {
    if (index < 0 || index >= MAX_TASKS || cost < 1 || cost > MAX_BUDGET || value < 0 || value > 10000) return -1;
    costs[index] = cost;
    values[index] = value;
    return 0;
}

// Returns a bit mask, or -1 for invalid input. Ties keep the earlier solution.
int solve(int count, int budget) {
    if (count < 0 || count > MAX_TASKS || budget < 0 || budget > MAX_BUDGET) return -1;
    for (int b = 0; b <= budget; ++b) { scores[0][b] = 0; masks[0][b] = 0; }
    for (int i = 1; i <= count; ++i) {
        if (costs[i - 1] < 1) return -1;
        for (int b = 0; b <= budget; ++b) {
            scores[i][b] = scores[i - 1][b];
            masks[i][b] = masks[i - 1][b];
            const int cost = costs[i - 1];
            if (cost <= b) {
                const int candidate = scores[i - 1][b - cost] + values[i - 1];
                if (candidate > scores[i][b]) {
                    scores[i][b] = candidate;
                    masks[i][b] = masks[i - 1][b - cost] | (1u << (i - 1));
                }
            }
        }
    }
    return static_cast<int>(masks[count][budget]);
}
}
