#include <stdio.h>
#include <time.h>

static long long
nanoseconds(clockid_t id) {
  struct timespec ts;
  clock_gettime(id, &ts);
  return (long long) ts.tv_sec * 1000000000LL + ts.tv_nsec;
}

int
main(void) {
  long long start = nanoseconds(CLOCK_MONOTONIC);

  struct timespec delay = {0, 20000000};
  nanosleep(&delay, NULL);

  long long elapsed = nanoseconds(CLOCK_MONOTONIC) - start;

  printf("slept %s\n", elapsed >= 20000000 ? "enough" : "too little");
  printf("realtime %s\n", nanoseconds(CLOCK_REALTIME) > 1700000000000000000LL ? "plausible" : "implausible");

  return 0;
}
