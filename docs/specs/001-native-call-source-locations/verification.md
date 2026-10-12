# Verification

Host: macOS ARM64. Compiler: caller-installed Free Pascal 3.2.2, Darwin AArch64.
Debugger: LLDB 2103.0.34.103 from Command Line Tools.

- Python producer/budget/output tests: 10 passed.
- Focused native provider, retained-journal and MCP tests: 18 passed.
- Real Pascal CLI and stdio MCP: three expected calls, integer register values
  0/1/2, source path and positive line attribution, successful target exit.
- Repository static checks: six tasks and architecture guards passed.
- Test discovery: all 982 test files discovered exactly once.

The complete native-call verifier did not pass. One run reported exited instead
of event-limit for capped overlapping breakpoints. Another reported unavailable
launch start identity in a later capped scenario. Investigation:
https://github.com/morluto/rea/issues/2397. These results have not yet been isolated
on unchanged upstream. The source-coordinate PR remains draft.

The first real native scenario and CLI/MCP source-coordinate comparisons completed
before those broader failures. The Pascal lane verifies bounded native call
observation; it does not establish typed Pascal local values, source breakpoints,
interactive stepping, Delphi compatibility or a GDB provider.
