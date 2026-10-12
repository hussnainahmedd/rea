program ReaPascalCalls;

{$mode objfpc}
{$inline off}

procedure ReaPascalCall(Value: LongInt); cdecl; public name 'rea_pascal_call';
begin
  WriteLn('pascal ', Value);
end;

var
  Index: LongInt;
begin
  for Index := 0 to 2 do
    ReaPascalCall(Index);
end.
