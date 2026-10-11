---
title: Math functions
nav: Math
---

The math functions work with numbers: arithmetic, remainders and powers, rounding, totals over lists and the payment on a loan.

::ref functions Math

Two things hold for all of them. The result of `+`, `-`, `*`, `/`, `^`, `sum`, `avg` and `pmt` is kept to twelve significant digits, so `(+ 0.1 0.2)` is `0.3`, not `0.30000000000000004`. And a value that isn't a number is read like this: nothing and empty text are 0, `true` and `false` are 1 and 0, and text such as `"2"` or `"1,200"` is the number it spells. Text that isn't a number is an error, `expected a number, got "abc"`, except for [sum](fn:sum), [avg](fn:avg), [min](fn:min) and [max](fn:max), which skip it.

Some examples read two cells of this little document, one filled in and one left empty:

```notation id=cells
["col",
  ["input", {"name": "qty", "type": "number", "value": 4}],
  ["input", {"name": "blank", "type": "number"}]]
```

## Arithmetic

::: fn +
Adds its arguments. Any number of them; none gives 0.

```sx
(+ 1 2 3)
⇒ 6
(+ 0.1 0.2)
⇒ 0.3
(+ 1 "2")
⇒ 3
(+ 1 "1,200")
⇒ 1201
```

`+` adds. It never joins text: `(+ "5" "5")` is 10. To join, use [str](fn:str). An empty cell adds 0, and text that isn't a number is an error:

```sx in=cells
(+ qty blank)
⇒ 4
(+ qty "abc")
⇒ error: expected a number, got "abc"
```

See also [sum](fn:sum), which adds the numbers in a list and skips what isn't one.
:::

::: fn -
With one argument, gives its opposite. With more, subtracts the others from the first, in order.

```sx
(- 10 3 2)
⇒ 5
(- 5)
⇒ -5
(- 0.3 0.1)
⇒ 0.2
```

Write spaces around the minus. A hyphen inside a word is part of a name: `unit-price` is one cell's name, not `unit` minus `price`. See [Names and references](/language/names/).
:::

::: fn *
Multiplies its arguments.

```sx
(* 2 3 4)
⇒ 24
(* 100 1.15)
⇒ 115
```

An empty cell multiplies as 0, so a total of price times an unfilled quantity is 0:

```sx in=cells
(* qty blank)
⇒ 0
```
:::

::: fn /
Divides the first argument by each of the others in turn. Dividing by 0 is an error.

```sx
(/ 10 4)
⇒ 2.5
(/ 100 2 5)
⇒ 10
(/ 1 3)
⇒ 0.333333333333
(/ 1 0)
⇒ error: division by zero
```

An empty cell as the divisor is 0 and fails the same way. Guard it with [if](fn:if), as in `(if (empty? n) 0 (/ total n))`, and use [round](fn:round) to tidy long results: `(round (/ 10 3) 2)` is 3.33.
:::

::: fn %
The remainder after dividing the first argument by the second. It takes the sign of the first. Also written `mod`.

```sx
(% 10 3)
⇒ 1
(% -7 3)
⇒ -1
(% 5.5 2)
⇒ 1.5
(% 1 0)
⇒ error: division by zero
```

A remainder of 0 means the first number divides evenly: `(= (% n 2) 0)` asks whether `n` is even.
:::

::: fn ^
Raises the first argument to the power of the second. Also written `pow`.

```sx
(^ 2 10)
⇒ 1024
(^ 9 0.5)
⇒ 3
(^ 2 -1)
⇒ 0.5
```

Compound growth is a power: 1,000 at 5% a year for ten years.

```sx
(round (* 1000 (^ 1.05 10)) 2)
⇒ 1628.89
```
:::

## Absolute value and square root

::: fn abs
Gives a number without its sign.

```sx
(abs -4.5)
⇒ 4.5
(abs 3)
⇒ 3
```

An empty cell gives 0. Use it for the size of a difference whichever way round it is: `(abs (- actual target))`.
:::

::: fn sqrt
The square root of a number.

```sx
(sqrt 16)
⇒ 4
(round (sqrt 2) 3)
⇒ 1.414
```

A negative number has no square root. The result is not a number, and shows as `NaN`.
:::

## Rounding

::: fn round
Rounds a number to a number of decimals: `(round x 2)`. Leave the decimals out for a whole number. A negative number of decimals rounds to tens, hundreds and so on. A half rounds up, toward the larger number.

```sx
(round 3.14159 2)
⇒ 3.14
(round 2.5)
⇒ 3
(round -2.5)
⇒ -2
(round 1234.5678 -2)
⇒ 1200
(round "3.14159" 2)
⇒ 3.14
(round 1.005 2)
⇒ 1.01
```

`round` changes the value. To change only how it shows, give the cell a [format](/language/formats/) such as `int` or `0.00` and keep the exact number underneath.

See also [floor](fn:floor) and [ceil](fn:ceil), which always go one way.
:::

::: fn floor
Rounds down to the whole number below. For a negative number, that is further from zero.

```sx
(floor 2.7)
⇒ 2
(floor -2.1)
⇒ -3
```
:::

::: fn ceil
Rounds up to the whole number above. For a negative number, that is nearer zero.

```sx
(ceil 2.1)
⇒ 3
(ceil -2.7)
⇒ -2
```

Use it for "how many boxes": 25 items at 10 to a box need `(ceil (/ 25 10))`, which is 3.
:::

::: fn clamp
Keeps a number between a lowest and a highest value: `(clamp x lo hi)`. Below `lo` it gives `lo`; above `hi` it gives `hi`.

```sx
(clamp 15 0 10)
⇒ 10
(clamp -3 0 10)
⇒ 0
(clamp 5 0 10)
⇒ 5
```

Write the lowest value first. With the two swapped, the answer is always the second of them: `(clamp 5 10 0)` is 0.
:::

## Totals over lists

These four look through everything they are given, lists inside lists included, and use only the numbers they find. Text that is plain digits, such as `"2"` or `"3.5"`, counts. Other text, `true`, `false`, nothing and records are skipped, not treated as 0. That makes them safe on a column that has gaps, and it means `(sum (rows "orders"))` gives 0: take a field first, as `(sum (column (rows "orders") "total"))` does.

::: fn sum
Adds every number found in its arguments. No numbers gives 0.

```sx
(sum 1 2 3)
⇒ 6
(sum (list 1 (list 2 3)))
⇒ 6
(sum (list 1 "2" "x" nil true))
⇒ 3
```

Text counts only when it is plain digits. `"1,200"` has a comma and is skipped:

```sx
(sum (list "1,200" 2))
⇒ 2
```

Typically a column of a table or a collection: `(sum (column (rows "orders") "total"))`. See also [sum-by](fn:sum-by), which adds an expression over each item, and [+](fn:+), which adds exactly the arguments it is given and refuses text.
:::

::: fn avg
The mean of the numbers found. No numbers gives 0, not an error. Also written `average`.

```sx
(avg 2 4 9)
⇒ 5
(avg (list 1 "a" 3))
⇒ 2
(avg (list))
⇒ 0
```

Gaps are not counted: `(avg 4 nil 8)` is 6, the mean of two numbers, not of three.
:::

::: fn min
The smallest number found. No numbers gives 0.

```sx
(min 4 2 8)
⇒ 2
(min (list 3 "1" 2))
⇒ 1
(min (list))
⇒ 0
```
:::

::: fn max
The largest number found. No numbers gives 0.

```sx
(max (list 4 9 2))
⇒ 9
(max -5 -2)
⇒ -2
(max)
⇒ 0
```

An empty list gives 0, even if the numbers you expect are all negative. Check with [empty?](fn:empty?) when that matters.
:::

## Loans

::: fn pmt
The payment for each period on a loan: `(pmt rate periods principal)`. The rate is per period, so for monthly payments on a yearly rate, divide by 12. The payments are made at the end of each period. With a rate of 0 the principal is split evenly. With no periods there is nothing to work out, which is an error.

```sx
(round (pmt (/ 0.06 12) 360 200000) 2)
⇒ 1199.1
(round (pmt 0.005 12 1000) 2)
⇒ 86.07
(pmt 0 12 1200)
⇒ 100
(pmt 0.01 0 1000)
⇒ error: pmt needs at least one period
```

The first is a 200,000 loan over 30 years at 6% a year: about 1,199.10 a month. Round the result for money. For the total paid back, multiply the payment by the number of periods.
:::
