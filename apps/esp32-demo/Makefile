test:
	gcc -Wall -Wextra -Werror -std=c11 -fsanitize=address,undefined -o /tmp/test_safety core/safety.c test/test_safety.c && /tmp/test_safety
.PHONY: test
