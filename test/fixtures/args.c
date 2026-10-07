#include <stdio.h>

extern char **environ;

int
main(int argc, char **argv) {
  for (int i = 0; i < argc; i++) printf("arg %s\n", argv[i]);

  for (char **entry = environ; *entry; entry++) printf("env %s\n", *entry);

  return 0;
}
