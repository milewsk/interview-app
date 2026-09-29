# CLR, JIT and compilation in .NET {mid}

"What happens between writing C# code and running it?" is a classic interview opener. The short answer: the compiler produces **IL**, and the
**CLR** turns it into machine code at runtime with the **JIT** compiler, unless the app is compiled ahead of time (**AOT**).

## From source code to machine code

1. The **Roslyn** C# compiler compiles `.cs` files to **IL** (Intermediate Language, also CIL/MSIL) plus **metadata** (types, members, references),
   packaged in an **assembly** (`.dll` or `.exe`). IL is independent of the processor.
2. At startup the **CLR** (Common Language Runtime) loads the assembly, verifies types and prepares the environment: the GC, exceptions, the type system,
   security, interop.
3. When a method is called for the first time, the **JIT** (just-in-time) compiler translates its IL to native code for the current processor, and later
   calls use the compiled code.

```csharp
static int Add(int a, int b) => a + b;
// IL: 02 03 58 2A  →  ldarg.0, ldarg.1, add, ret
```

In a test, the first call of a method (including JIT) took ~150 µs, and the next one was practically free.

## Tiered compilation and PGO

The JIT has to balance compilation speed against code quality:

- **Tier 0**: fast compilation without optimizations (quick JIT), or loading ReadyToRun code, so the app starts quickly.
- **Tier 1**: frequently called methods are recompiled **in the background** with full optimizations.
- **Dynamic PGO** (profile-guided optimization, enabled by default since .NET 8): the tier-0 code collects a profile (which types really occur, which
  branches are taken), and tier 1 uses it, e.g. for devirtualization of interface calls and better inlining.

This means that .NET code gets faster after "warming up", and short benchmarks without warmup give misleading results, which is why BenchmarkDotNet runs
warmup iterations.

## ReadyToRun and Native AOT

| | JIT (default) | ReadyToRun | Native AOT |
|---|---|---|---|
| When native code is created | at runtime | at publish, plus JIT when needed | entirely at publish |
| Startup | slower | faster | fastest |
| Peak performance | best (tier 1 + PGO) | good (hot methods get rejitted) | good, no PGO at runtime |
| Size | small | larger | self-contained, trimmed |
| Restrictions | none | none | no `Reflection.Emit`, no dynamic assembly loading, trimming required |

**Native AOT** (`<PublishAot>true</PublishAot>`) produces a single self-contained native binary without a JIT: faster startup and lower memory usage,
ideal for serverless functions, containers and CLI tools. But the whole app must be compatible: no runtime code generation (`System.Reflection.Emit`),
no `Assembly.LoadFile`, limited reflection (trimming removes unused code), and libraries relying on these (some serializers, older ORMs) need source
generators instead. On Windows, publishing requires the Visual Studio C++ tooling (the linker).

## Other terms

- **Managed code**: runs under the CLR's control (GC, type safety, exceptions). **Unmanaged code**: native code (C/C++, OS APIs), called through P/Invoke.
- **CTS / CLS**: the Common Type System defines the types shared by .NET languages (C#, F#, VB), and the Common Language Specification is the subset that
  guarantees cross-language interoperability.
- **BCL**: the Base Class Library (`System.*`), and the core types live in `System.Private.CoreLib`.
- **Framework-dependent vs self-contained**: an app either uses the .NET runtime installed on the machine, or brings its own runtime (larger, but
  independent).

## .NET, .NET Framework and .NET Standard

- **.NET Framework** (up to 4.8.1): Windows only, in maintenance mode, getting only fixes.
- **.NET** (formerly .NET Core; .NET 5+): cross-platform, open source, developed actively. A new version ships **every November**. Even versions are
  **LTS** (3 years of support: .NET 8, .NET 10), odd versions are **STS** (2 years: .NET 9).
- **.NET Standard**: a specification of APIs shared by the old implementations, used for libraries targeting both .NET Framework and .NET. For new code
  targeting only modern .NET, you target e.g. `net10.0`.

## Sources

- [Common Language Runtime (CLR) overview](https://learn.microsoft.com/en-us/dotnet/standard/clr)
- [Managed execution process](https://learn.microsoft.com/en-us/dotnet/standard/managed-execution-process)
- [Compilation config settings (tiered compilation, PGO)](https://learn.microsoft.com/en-us/dotnet/core/runtime-config/compilation)
- [ReadyToRun compilation](https://learn.microsoft.com/en-us/dotnet/core/deploying/ready-to-run)
- [Native AOT deployment](https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/)
- [.NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)

## Questions

### What is the CLR, and what does it do? {junior}

The Common Language Runtime is the .NET execution environment. It loads assemblies, compiles IL to machine code with the JIT, manages memory through the
garbage collector, handles exceptions, enforces type safety and provides interop with native code. Code running under its control is called managed code.

### What is IL, and why does .NET use it? {junior}

Intermediate Language is a processor-independent instruction set to which C# (and F#, VB) is compiled, stored in assemblies together with metadata. Thanks to
IL, one assembly runs on different operating systems and processors, languages can interoperate, and the JIT can optimize code for the specific machine it
runs on.

### How does JIT compilation work? {mid}

On a method's first call, the JIT compiles its IL to native code, and later calls use the compiled version. With tiered compilation, the method is first
compiled quickly without optimizations (tier 0), and if it's called often, it's recompiled in the background with full optimizations (tier 1). This gives
fast startup and good performance of hot code.

### What is tiered compilation and dynamic PGO? {senior}

Tiered compilation compiles methods first quickly (tier 0) and recompiles frequently used ones with optimizations (tier 1). Dynamic PGO, enabled by default
since .NET 8, adds instrumentation to tier-0 code that records which types and code paths really occur, and tier 1 uses that profile for devirtualization,
inlining and code layout. As a result, a running application can become faster than one compiled with purely static optimization.

### What is Native AOT, and what are its limitations? {mid}

Native AOT compiles the whole application to native code at publish time and produces a self-contained binary without a JIT. It gives fast startup and
low memory usage, which suits serverless, containers and CLI tools. Limitations: no runtime code generation (`Reflection.Emit`), no dynamic assembly
loading, trimming required (unused code is removed, so reflection must be annotated), and some libraries must use source generators instead of reflection.

### How does ReadyToRun differ from Native AOT? {senior}

ReadyToRun precompiles IL to native code at publish time, but keeps the IL and the JIT: startup is faster, hot methods are still recompiled by tier 1, and
all .NET features work. Native AOT removes the JIT entirely, so the app starts fastest and uses the least memory, but it has the limitations of no dynamic
code and required trimming. ReadyToRun is a safe startup optimization, and Native AOT a bigger architectural decision.

### What is the difference between .NET Framework, .NET and .NET Standard? {junior}

.NET Framework is the old, Windows-only implementation (last version 4.8.1), now only maintained. .NET (formerly .NET Core, now .NET 5 and later) is
cross-platform, open source and developed actively with a new version every year. .NET Standard is a specification of a common API that lets one library
work on both, and it matters mainly for libraries that must still support .NET Framework.

### How do LTS and STS versions differ? {junior}

LTS (Long Term Support) versions get 3 years of support, and STS (Standard Term Support) versions get 2 years. A new major version ships every November,
with even numbers being LTS (.NET 8, .NET 10) and odd numbers STS (.NET 9, .NET 11). Production systems usually choose LTS versions, so they don't have to
upgrade every year.

### What is an assembly? {junior}

The unit of deployment and versioning in .NET: a `.dll` or `.exe` file containing IL code, metadata describing its types and members, a manifest (name,
version, references to other assemblies) and optionally resources. Assemblies are loaded by the CLR, referenced by projects, and distributed as NuGet
packages.

### Why can a microbenchmark without warmup give misleading results? {mid}

The first calls include JIT compilation, and for a while the code runs as unoptimized tier 0. Only after it gets hot is it recompiled with optimizations
and PGO. A measurement taken too early mostly shows compilation cost and slow code. That's why tools like BenchmarkDotNet run warmup iterations, repeat
measurements and report statistics, and `Stopwatch` around a single call isn't a reliable benchmark.
