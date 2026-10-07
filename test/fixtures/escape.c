#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static void
attempt(const char *path) {
  int fd = open(path, O_RDONLY);

  if (fd >= 0) {
    printf("%s opened\n", path);
    close(fd);
  } else {
    printf("%s %s\n", path, strerror(errno));
  }
}

int
main(void) {
  symlink("../secret", "/data/relative");
  symlink("/secret", "/data/absolute");
  symlink("loop", "/data/loop");

  attempt("/data/../secret");
  attempt("/data/sub/../../secret");
  attempt("/secret");
  attempt("/data/relative");
  attempt("/data/absolute");
  attempt("/data/loop");
  attempt("/data/sub/../inside.txt");

  return 0;
}
