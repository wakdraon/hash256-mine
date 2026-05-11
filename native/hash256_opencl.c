#include <CL/cl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define CHECK_CL(x, msg) do { cl_int _err = (x); if (_err != CL_SUCCESS) { fprintf(stderr, "%s: %d\n", msg, _err); return 1; } } while (0)
#define MAX_DEVICES 16

typedef struct {
  uint32_t found;
  uint32_t nonce_lo;
  uint32_t nonce_hi;
  uint32_t hash[8];
} Result;

static const char *KERNEL =
"#pragma OPENCL EXTENSION cl_khr_int64_base_atomics : enable\n"
"typedef struct{uint found;uint nonce_lo;uint nonce_hi;uint hash[8];} Result;\n"
"__constant ulong RC[24]={0x0000000000000001UL,0x0000000000008082UL,0x800000000000808aUL,0x8000000080008000UL,0x000000000000808bUL,0x0000000080000001UL,0x8000000080008081UL,0x8000000000008009UL,0x000000000000008aUL,0x0000000000000088UL,0x0000000080008009UL,0x000000008000000aUL,0x000000008000808bUL,0x800000000000008bUL,0x8000000000008089UL,0x8000000000008003UL,0x8000000000008002UL,0x8000000000000080UL,0x000000000000800aUL,0x800000008000000aUL,0x8000000080008081UL,0x8000000000008080UL,0x0000000080000001UL,0x8000000080008008UL};\n"
"__constant int R[24]={1,3,6,10,15,21,28,36,45,55,2,14,27,41,56,8,25,43,62,18,39,61,20,44};\n"
"__constant int P[24]={10,7,11,17,18,3,5,16,8,21,24,4,15,23,19,13,12,2,20,14,22,9,6,1};\n"
"uint bswap32(uint v){return ((v&255U)<<24)|((v&65280U)<<8)|((v&16711680U)>>8)|((v&4278190080U)>>24);}\n"
"ulong rotl64(ulong x,int s){return rotate(x,(ulong)s);}\n"
"void keccakf(ulong st[25]){int i,j,r;ulong t,bc[5];for(r=0;r<24;r++){for(i=0;i<5;i++)bc[i]=st[i]^st[i+5]^st[i+10]^st[i+15]^st[i+20];for(i=0;i<5;i++){t=bc[(i+4)%5]^rotl64(bc[(i+1)%5],1);for(j=0;j<25;j+=5)st[j+i]^=t;}t=st[1];for(i=0;i<24;i++){j=P[i];bc[0]=st[j];st[j]=rotl64(t,R[i]);t=bc[0];}for(j=0;j<25;j+=5){for(i=0;i<5;i++)bc[i]=st[j+i];for(i=0;i<5;i++)st[j+i]^=(~bc[(i+1)%5])&bc[(i+2)%5];}st[0]^=RC[r];}}\n"
"int below(uint h[8],__global const uint *d){for(int i=0;i<8;i++){if(h[i]<d[i])return 1;if(h[i]>d[i])return 0;}return 0;}\n"
"__kernel void mine(__global const uint *challenge,__global const uint *difficulty,ulong base,__global Result *out){size_t gid=get_global_id(0);ulong nonce=base+(ulong)gid;ulong st[25];for(int i=0;i<25;i++)st[i]=0UL;st[0]=((ulong)challenge[1]<<32)|challenge[0];st[1]=((ulong)challenge[3]<<32)|challenge[2];st[2]=((ulong)challenge[5]<<32)|challenge[4];st[3]=((ulong)challenge[7]<<32)|challenge[6];uint lo=(uint)(nonce&0xffffffffUL);uint hi=(uint)(nonce>>32);st[7]=((ulong)bswap32(lo)<<32)|bswap32(hi);st[8]=1UL;st[16]=0x8000000000000000UL;keccakf(st);uint h[8];h[0]=bswap32((uint)(st[0]&0xffffffffUL));h[1]=bswap32((uint)(st[0]>>32));h[2]=bswap32((uint)(st[1]&0xffffffffUL));h[3]=bswap32((uint)(st[1]>>32));h[4]=bswap32((uint)(st[2]&0xffffffffUL));h[5]=bswap32((uint)(st[2]>>32));h[6]=bswap32((uint)(st[3]&0xffffffffUL));h[7]=bswap32((uint)(st[3]>>32));if(below(h,difficulty)){if(atomic_cmpxchg((volatile __global unsigned int *)&out->found,0U,1U)==0U){out->nonce_lo=lo;out->nonce_hi=hi;for(int i=0;i<8;i++)out->hash[i]=h[i];}}}\n";

static int hex_nibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static int parse_hex32(const char *hex, unsigned char out[32]) {
  if (hex[0] == '0' && (hex[1] == 'x' || hex[1] == 'X')) hex += 2;
  if (strlen(hex) != 64) return 0;
  for (int i = 0; i < 32; i++) {
    int hi = hex_nibble(hex[i * 2]);
    int lo = hex_nibble(hex[i * 2 + 1]);
    if (hi < 0 || lo < 0) return 0;
    out[i] = (unsigned char)((hi << 4) | lo);
  }
  return 1;
}

static uint32_t le32(const unsigned char *p) {
  return ((uint32_t)p[0]) | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static uint32_t be32(const unsigned char *p) {
  return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | ((uint32_t)p[3]);
}

static void print_hash(uint32_t h[8]) {
  printf("0x");
  for (int i = 0; i < 8; i++) printf("%08x", h[i]);
}

static double wall_time(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ts.tv_sec + ts.tv_nsec * 1e-9;
}

static size_t auto_batch_size(cl_device_id device) {
  cl_ulong mem = 0;
  clGetDeviceInfo(device, CL_DEVICE_GLOBAL_MEM_SIZE, sizeof(mem), &mem, NULL);
  cl_uint compute_units = 0;
  clGetDeviceInfo(device, CL_DEVICE_MAX_COMPUTE_UNITS, sizeof(compute_units), &compute_units, NULL);

  size_t batch;
  if (mem >= 20ULL * 1024 * 1024 * 1024)      batch = 256 * 1024 * 1024;
  else if (mem >= 10ULL * 1024 * 1024 * 1024)  batch = 128 * 1024 * 1024;
  else if (mem >= 6ULL * 1024 * 1024 * 1024)   batch = 64 * 1024 * 1024;
  else                                          batch = 32 * 1024 * 1024;

  if (compute_units >= 80) batch = batch * 2;
  else if (compute_units >= 40) batch = (batch * 3) / 2;

  batch = (batch / 256) * 256;
  return batch;
}

static int mine_device(cl_device_id device, int device_index,
                       uint32_t challenge[8], uint32_t difficulty[8],
                       size_t batch, uint64_t start_base) {
  cl_int err;

  cl_context context = clCreateContext(NULL, 1, &device, NULL, NULL, &err);
  CHECK_CL(err, "clCreateContext");
  cl_command_queue queue = clCreateCommandQueue(context, device, 0, &err);
  CHECK_CL(err, "clCreateCommandQueue");
  cl_program program = clCreateProgramWithSource(context, 1, &KERNEL, NULL, &err);
  CHECK_CL(err, "clCreateProgramWithSource");
  err = clBuildProgram(program, 1, &device, "-cl-mad-enable -cl-fast-relaxed-math", NULL, NULL);
  if (err != CL_SUCCESS) {
    char log[8192];
    clGetProgramBuildInfo(program, device, CL_PROGRAM_BUILD_LOG, sizeof(log), log, NULL);
    fprintf(stderr, "GPU %d build error: %s\n", device_index, log);
    return 1;
  }

  cl_kernel kernel = clCreateKernel(program, "mine", &err);
  CHECK_CL(err, "clCreateKernel");

  size_t preferred_wg = 0;
  clGetKernelWorkGroupInfo(kernel, device, CL_KERNEL_PREFERRED_WORK_GROUP_SIZE_MULTIPLE,
                           sizeof(preferred_wg), &preferred_wg, NULL);
  if (preferred_wg < 32) preferred_wg = 64;
  size_t local_wg = preferred_wg * 4;
  size_t max_wg = 0;
  clGetKernelWorkGroupInfo(kernel, device, CL_KERNEL_WORK_GROUP_SIZE, sizeof(max_wg), &max_wg, NULL);
  if (local_wg > max_wg) local_wg = max_wg;
  batch = (batch / local_wg) * local_wg;
  if (batch < local_wg) batch = local_wg;

  cl_mem challenge_buf = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(uint32_t) * 8, challenge, &err);
  CHECK_CL(err, "challenge buffer");
  cl_mem difficulty_buf = clCreateBuffer(context, CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR, sizeof(uint32_t) * 8, difficulty, &err);
  CHECK_CL(err, "difficulty buffer");
  Result result;
  cl_mem result_buf = clCreateBuffer(context, CL_MEM_READ_WRITE, sizeof(result), NULL, &err);
  CHECK_CL(err, "result buffer");

  CHECK_CL(clSetKernelArg(kernel, 0, sizeof(cl_mem), &challenge_buf), "arg0");
  CHECK_CL(clSetKernelArg(kernel, 1, sizeof(cl_mem), &difficulty_buf), "arg1");
  CHECK_CL(clSetKernelArg(kernel, 3, sizeof(cl_mem), &result_buf), "arg3");

  fprintf(stderr, "GPU %d: batch=%zu local_wg=%zu preferred_wg_multiple=%zu\n",
          device_index, batch, local_wg, preferred_wg);

  uint64_t base = start_base;
  uint64_t total = 0;
  uint64_t grand_total = 0;
  double started = wall_time();
  double grand_start = started;

  for (;;) {
    if (base > UINT64_MAX - batch) {
      fprintf(stderr, "GPU %d: nonce space exhausted\n", device_index);
      break;
    }

    memset(&result, 0, sizeof(result));
    CHECK_CL(clEnqueueWriteBuffer(queue, result_buf, CL_TRUE, 0, sizeof(result), &result, 0, NULL, NULL), "clear result");
    CHECK_CL(clSetKernelArg(kernel, 2, sizeof(uint64_t), &base), "arg2");
    CHECK_CL(clEnqueueNDRangeKernel(queue, kernel, 1, NULL, &batch, &local_wg, 0, NULL, NULL), "enqueue");
    CHECK_CL(clFinish(queue), "finish");
    CHECK_CL(clEnqueueReadBuffer(queue, result_buf, CL_TRUE, 0, sizeof(result), &result, 0, NULL, NULL), "read result");

    total += batch;
    grand_total += batch;
    if (result.found) {
      uint64_t nonce = ((uint64_t)result.nonce_hi << 32) | result.nonce_lo;
      double elapsed = wall_time() - grand_start;
      printf("{\"type\":\"found\",\"nonce\":\"%llu\",\"hash\":\"", (unsigned long long)nonce);
      print_hash(result.hash);
      printf("\",\"hashes\":\"%llu\",\"gpu\":%d,\"elapsed\":%.1f,\"avg_hashrate\":%.0f}\n",
             (unsigned long long)grand_total, device_index, elapsed,
             elapsed > 0 ? grand_total / elapsed : 0);
      fflush(stdout);

      clReleaseMemObject(challenge_buf);
      clReleaseMemObject(difficulty_buf);
      clReleaseMemObject(result_buf);
      clReleaseKernel(kernel);
      clReleaseProgram(program);
      clReleaseCommandQueue(queue);
      clReleaseContext(context);
      return 0;
    }

    double seconds = wall_time() - started;
    if (seconds > 0.5) {
      double grand_elapsed = wall_time() - grand_start;
      printf("{\"type\":\"progress\",\"hashes\":\"%llu\",\"hashrate\":%.0f,\"gpu\":%d,\"total\":\"%llu\",\"avg_hashrate\":%.0f}\n",
             (unsigned long long)total, total / seconds, device_index,
             (unsigned long long)grand_total,
             grand_elapsed > 0 ? grand_total / grand_elapsed : 0);
      fflush(stdout);
      started = wall_time();
      total = 0;
    }
    base += batch;
  }

  clReleaseMemObject(challenge_buf);
  clReleaseMemObject(difficulty_buf);
  clReleaseMemObject(result_buf);
  clReleaseKernel(kernel);
  clReleaseProgram(program);
  clReleaseCommandQueue(queue);
  clReleaseContext(context);
  return 1;
}

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: %s <challenge_hex> <difficulty_hex> [batch_size] [gpu_index]\n", argv[0]);
    return 2;
  }

  unsigned char challenge_bytes[32], difficulty_bytes[32];
  if (!parse_hex32(argv[1], challenge_bytes) || !parse_hex32(argv[2], difficulty_bytes)) {
    fprintf(stderr, "challenge/difficulty must be 32-byte hex\n");
    return 2;
  }

  int gpu_index = -1;
  if (argc >= 5) gpu_index = atoi(argv[4]);

  uint32_t challenge[8], difficulty[8];
  for (int i = 0; i < 8; i++) {
    challenge[i] = le32(challenge_bytes + i * 4);
    difficulty[i] = be32(difficulty_bytes + i * 4);
  }

  cl_int err;
  cl_platform_id platform;
  CHECK_CL(clGetPlatformIDs(1, &platform, NULL), "clGetPlatformIDs");

  cl_uint num_devices = 0;
  cl_device_id devices[MAX_DEVICES];
  CHECK_CL(clGetDeviceIDs(platform, CL_DEVICE_TYPE_GPU, MAX_DEVICES, devices, &num_devices), "clGetDeviceIDs(GPU)");

  if (num_devices == 0) {
    fprintf(stderr, "No GPU devices found\n");
    return 1;
  }

  fprintf(stderr, "Found %u GPU device(s)\n", num_devices);
  for (cl_uint i = 0; i < num_devices; i++) {
    char name[256] = {0};
    cl_ulong mem = 0;
    cl_uint cu = 0;
    clGetDeviceInfo(devices[i], CL_DEVICE_NAME, sizeof(name), name, NULL);
    clGetDeviceInfo(devices[i], CL_DEVICE_GLOBAL_MEM_SIZE, sizeof(mem), &mem, NULL);
    clGetDeviceInfo(devices[i], CL_DEVICE_MAX_COMPUTE_UNITS, sizeof(cu), &cu, NULL);
    fprintf(stderr, "  GPU %u: %s (%llu MB, %u CUs)\n", i, name,
            (unsigned long long)(mem / (1024 * 1024)), cu);
  }

  int selected = (gpu_index >= 0) ? gpu_index : 0;
  if ((cl_uint)selected >= num_devices) {
    fprintf(stderr, "GPU index %d out of range (0-%u)\n", selected, num_devices - 1);
    return 2;
  }

  size_t batch;
  if (argc >= 4 && strtoull(argv[3], NULL, 10) > 0) {
    batch = (size_t)strtoull(argv[3], NULL, 10);
    if (batch < 65536) batch = 65536;
  } else {
    batch = auto_batch_size(devices[selected]);
    fprintf(stderr, "Auto batch size: %zu (%.1f M)\n", batch, batch / 1e6);
  }

  uint64_t start_base = ((uint64_t)time(NULL) << 32) ^ (uint64_t)clock();
  return mine_device(devices[selected], selected, challenge, difficulty, batch, start_base);
}
