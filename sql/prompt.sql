Please review and refactor the code provided below.
Goals:

1. Modularize: Break down large, complex functions into smaller, single-responsibility helper functions.
2. Readability & Clean Code: Improve naming conventions, reduce duplicate code/queries, and remove redundant logic.
3. Performance & Optimization: Reduce unnecessary database queries, redundant lookups, or heavy memory operations.
4. Error Handling: Ensure proper edge cases are caught and errors are handled safely.
5. Type Safety: Ensure TypeScript types are precise and avoid using `any`. 
Next is Analyze the following server-side code specifically for performance and execution efficiency.
Key Focus Areas:
   * Eliminate N+1 query patterns and batch database/API lookups where possible.
   * Reduce redundant status or dynamic schema lookups.
   * Optimize loop logic and data transformations.