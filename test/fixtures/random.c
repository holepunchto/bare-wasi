#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int
main(void) {
  unsigned char buffer[16] = {0};

  if (getentropy(buffer, sizeof(buffer)) != 0) {
    printf("error %s\n", strerror(errno));
    return 1;
  }

  for (size_t i = 0; i < sizeof(buffer); i++) printf("%02x", buffer[i]);

  printf("\n");

  return 0;
}
