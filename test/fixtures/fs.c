#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#define CHECK(expr) \
  if (!(expr)) { \
    printf("failed %s: %s\n", #expr, strerror(errno)); \
    return 1; \
  }

int
main(void) {
  char buffer[64] = {0};

  FILE *file = fopen("/data/hello.txt", "r");
  CHECK(file != NULL);
  CHECK(fgets(buffer, sizeof(buffer), file) != NULL);
  fclose(file);
  printf("read %s\n", buffer);

  CHECK(mkdir("/data/dir", 0755) == 0);
  CHECK(mkdir("/data/dir", 0755) == -1 && errno == EEXIST);

  file = fopen("/data/dir/new.txt", "w");
  CHECK(file != NULL);
  fputs("written from wasm", file);
  fclose(file);

  file = fopen("/data/dir/new.txt", "a");
  CHECK(file != NULL);
  fputs("!", file);
  fclose(file);

  struct stat st;
  CHECK(stat("/data/dir/new.txt", &st) == 0);
  printf("size %lld regular %d\n", (long long) st.st_size, S_ISREG(st.st_mode));

  CHECK(rename("/data/dir/new.txt", "/data/dir/renamed.txt") == 0);
  CHECK(symlink("renamed.txt", "/data/dir/link") == 0);

  ssize_t len = readlink("/data/dir/link", buffer, sizeof(buffer) - 1);
  CHECK(len > 0);
  buffer[len] = '\0';
  printf("link %s\n", buffer);

  int fd = open("/data/dir/link", O_RDONLY);
  CHECK(fd >= 0);
  CHECK(lseek(fd, 8, SEEK_SET) == 8);
  memset(buffer, 0, sizeof(buffer));
  CHECK(read(fd, buffer, 4) == 4);
  close(fd);
  printf("seek %s\n", buffer);

  DIR *dir = opendir("/data/dir");
  CHECK(dir != NULL);

  struct dirent *entry;
  while ((entry = readdir(dir)) != NULL) {
    if (entry->d_name[0] != '.') printf("entry %s\n", entry->d_name);
  }

  closedir(dir);

  CHECK(rmdir("/data/dir") == -1 && errno == ENOTEMPTY);

  fd = open("/data/dir/renamed.txt", O_RDWR);
  CHECK(fd >= 0);
  CHECK(ftruncate(fd, 7) == 0);
  close(fd);

  CHECK(stat("/data/dir/renamed.txt", &st) == 0);
  printf("truncated %lld\n", (long long) st.st_size);

  CHECK(unlink("/data/hello.txt") == 0);
  CHECK(access("/data/hello.txt", F_OK) == -1 && errno == ENOENT);

  printf("done\n");

  return 0;
}
